import aiohttp
import json
from django.utils import timezone
import firebase_admin
from firebase_admin import auth as admin_auth, messaging, credentials, db
from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
import hashlib
import stripe
import hmac
from urllib.parse import quote_plus
import pyrebase

if not firebase_admin._apps:
    cred = credentials.Certificate(settings.FIREBASE_ADMIN_CREDENTIALS)
    firebase_admin.initialize_app(cred, {
        'databaseURL': settings.FIREBASE_CONFIG['databaseURL']
    })

# Hàm gọi Gemini API (bất đồng bộ)
GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

async def call_gemini_api(message):
    if len(message) > 1000:
        raise ValueError("Tin nhắn quá dài, tối đa 1000 ký tự.")
    
    prompt = (
        f"Analyze the following message: '{message}'. "
        "If it contains medical terminology, provide a concise explanation in Vietnamese. "
        "If it describes a medical issue, offer brief preliminary guidance and advise consulting a doctor. "
        "Keep the response short and clear, suitable for real-time chat."
    )
    headers = {'Content-Type': 'application/json'}
    data = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'maxOutputTokens': 150, 'temperature': 0.7}
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f'{GEMINI_API_URL}?key={settings.GEMINI_API_KEY}',
                headers=headers,
                json=data
            ) as response:
                response.raise_for_status()
                result = await response.json()
                if 'candidates' not in result or not result['candidates']:
                    raise ValueError("Không nhận được phản hồi hợp lệ từ Gemini API.")
                return result['candidates'][0]['content']['parts'][0]['text']
    except aiohttp.ClientError as e:
        raise Exception(f"Lỗi khi gọi Gemini API: {str(e)}")
    except KeyError as e:
        raise Exception(f"Định dạng phản hồi Gemini API không đúng: {str(e)}")

# Các hàm Firebase
async def create_firebase_user(email, password, user_id, role):
    try:
        firebase = pyrebase.initialize_app(settings.FIREBASE_CONFIG)
        auth = firebase.auth()
        # Bọc synchronous Firebase call trong sync_to_async
        user = await sync_to_async(auth.create_user_with_email_and_password)(email, password)
        await sync_to_async(admin_auth.set_custom_user_claims)(user['localId'], {'role': role})
        return {'success': True, 'user': user}
    except Exception as e:
        return {'success': False, 'message': f"Lỗi khi tạo người dùng Firebase: {str(e)}"}

async def create_django_and_firebase_user(username, email, password, role, **extra_fields):
    User = get_user_model()
    # Bọc synchronous Django ORM call
    user = await sync_to_async(User.objects.create_user)(
        username=username, email=email, password=password, role=role, **extra_fields
    )
    firebase_result = await create_firebase_user(email, password, user.id, role)
    if not firebase_result['success']:
        # Bọc synchronous delete
        await sync_to_async(user.delete)()
        raise Exception(firebase_result['message'])
    return user

def save_message_to_firebase(user_id, conversation_id, message, response):
    try:
        ref = db.reference(f'chat_messages/{conversation_id}')
        message_data = {
            'user_id': str(user_id),
            'message': message,
            'response': response,
            'timestamp': timezone.now().isoformat(),
            'message_type': 'user'
        }
        ref.push(message_data)
        return {'success': True, 'message': 'Tin nhắn đã được lưu vào Firebase.'}
    except Exception as e:
        return {'success': False, 'message': f"Lỗi khi lưu tin nhắn vào Firebase: {str(e)}"}

async def send_fcm_v1(user, title, body, data=None):
    try:
        # Bọc synchronous Django ORM query
        tokens = await sync_to_async(lambda: list(DeviceToken.objects.filter(user=user)))()
        if not tokens:
            return {'success': False, 'message': 'Không tìm thấy token thiết bị.'}
        invalid_tokens = []
        for token in tokens:
            try:
                message = messaging.Message(
                    notification=messaging.Notification(
                        title=title,
                        body=body,
                    ),
                    token=token.token,
                    data=data
                )
                # Bọc synchronous Firebase messaging call
                await sync_to_async(messaging.send)(message)
            except messaging.FirebaseError as e:
                if 'not-registered' in str(e):
                    invalid_tokens.append(token.token)
        # Xóa token không hợp lệ
        if invalid_tokens:
            await sync_to_async(DeviceToken.objects.filter(token__in=invalid_tokens).delete)()
        return {'success': True, 'message': 'Thông báo đã được gửi.'}
    except Exception as e:
        return {'success': False, 'message': f"Lỗi khi gửi FCM: {str(e)}"}

# Khởi tạo Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY

def create_stripe_checkout_session(order, user):
    """Tạo Stripe Checkout Session."""
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[
                {
                    'price_data': {
                        'currency': 'vnd',
                        'product_data': {
                            'name': f"Đơn hàng {order.order_code}",
                        },
                        'unit_amount': int(order.total_amount),
                    },
                    'quantity': 1,
                },
            ],
            mode='payment',
            success_url=f"{settings.BACKEND_URL}/success/?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.BACKEND_URL}/cancel/",
            metadata={
                'order_id': order.id,
                'order_code': order.order_code,
                'user_id': str(user.id),
            },
        )
        return {
            'success': True,
            'checkout_url': session.url,
            'session_id': session.id
        }
    except stripe.error.StripeError as e:
        return {'success': False, 'message': f"Lỗi khi tạo Checkout Session: {str(e)}"}

def process_stripe_refund(payment):
    """Xử lý hoàn tiền qua Stripe."""
    try:
        refund = stripe.Refund.create(
            payment_intent=payment.transaction_id,
            amount=int(float(payment.amount) * 100),
            reason='requested_by_customer',
        )
        return {'success': True, 'refund_id': refund.id}
    except stripe.error.StripeError as e:
        return {'success': False, 'message': f"Lỗi khi hoàn tiền: {str(e)}"}

def generate_reset_code(uidb64, token):
    """Tạo mã code 6 ký tự từ uidb64 và token."""
    combined = f"{uidb64}{token}".encode('utf-8')
    hash_object = hashlib.sha256(combined)
    code = hash_object.hexdigest()[:6].upper()
    return code
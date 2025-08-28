import pyrebase
import requests
from firebase_admin import auth as admin_auth, messaging, credentials, db
from django.conf import settings
from django.utils import timezone
import firebase_admin
import hashlib
import stripe
import hmac
from urllib.parse import quote_plus
from django.contrib.auth import get_user_model

if not firebase_admin._apps:
    cred = credentials.Certificate(settings.FIREBASE_ADMIN_CREDENTIALS)
    firebase_admin.initialize_app(cred, {
        'databaseURL': settings.FIREBASE_CONFIG['databaseURL']
    })

# Hàm gọi Gemini API
GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

def call_gemini_api(message):
    if len(message) > 1000:  # Giới hạn độ dài tin nhắn
        raise ValueError("Tin nhắn quá dài, vui lòng gửi tin nhắn ngắn hơn.")
    
    prompt = (
        f"Analyze the following message: '{message}'. "
        "If it contains medical terminology, provide a concise explanation in Vietnamese. "
        "If it describes a medical issue, offer brief preliminary guidance and advise consulting a doctor. "
        "Keep the response short and clear, suitable for real-time chat."
    )
    headers = {
        'Content-Type': 'application/json',
    }
    data = {
        'contents': [{
            'parts': [{'text': prompt}]
        }],
        'generationConfig': {
            'maxOutputTokens': 150,
            'temperature': 0.7,
        }
    }
    try:
        response = requests.post(
            f'{GEMINI_API_URL}?key={settings.GEMINI_API_KEY}',
            headers=headers,
            json=data
        )
        response.raise_for_status()
        result = response.json()
        return result['candidates'][0]['content']['parts'][0]['text']
    except requests.exceptions.RequestException as e:
        raise Exception(f"Lỗi khi gọi Gemini API: {str(e)}")

# Các hàm Firebase hiện có
def create_firebase_user(email, password, user_id, role):
    try:
        firebase = pyrebase.initialize_app(settings.FIREBASE_CONFIG)
        auth = firebase.auth()
        user = auth.create_user_with_email_and_password(email, password)
        admin_auth.set_custom_user_claims(user['localId'], {'role': role})
        return {'success': True, 'user': user}
    except Exception as e:
        return {'success': False, 'message': f"Lỗi khi tạo người dùng Firebase: {str(e)}"}

def create_django_and_firebase_user(username, email, password, role, **extra_fields):
    User = get_user_model()
    user = User.objects.create_user(username=username, email=email, password=password, role=role, **extra_fields)
    firebase_result = create_firebase_user(email, password, user.id, role)
    if not firebase_result['success']:
        user.delete()
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

def send_fcm_v1(user, title, body, data=None):
    try:
        tokens = DeviceToken.objects.filter(user=user)
        if not tokens.exists():
            return {'success': False, 'message': 'Không tìm thấy token thiết bị.'}
        for token in tokens:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body,
                ),
                token=token.token,
                data=data
            )
            messaging.send(message)
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
                        'currency': 'vnd',  # Sử dụng VND
                        'product_data': {
                            'name': f"Đơn hàng {order.order_code}",
                        },
                        'unit_amount': int(order.total_amount),  # Số tiền VND trực tiếp
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
            amount=int(float(payment.amount) * 100),  # Chuyển sang cent
            reason='requested_by_customer',
        )
        return {'success': True, 'refund_id': refund.id}
    except stripe.error.StripeError as e:
        return {'success': False, 'message': f"Lỗi khi hoàn tiền: {str(e)}"}

def generate_reset_code(uidb64, token):
    """Tạo mã code 6 ký tự từ uidb64 và token."""
    import hashlib
    combined = f"{uidb64}{token}".encode('utf-8')
    hash_object = hashlib.sha256(combined)
    code = hash_object.hexdigest()[:6].upper()  # Lấy 6 ký tự đầu, chuyển thành chữ hoa
    return code
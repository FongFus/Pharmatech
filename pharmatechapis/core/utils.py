import pyrebase
import requests
from firebase_admin import auth as admin_auth, messaging, credentials, db
from django.conf import settings
from django.utils import timezone
import firebase_admin
import hashlib
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

def process_refund(payment):
    """Xử lý hoàn tiền cho thanh toán qua VNPay."""
    try:
        vnp_TmnCode = settings.VNPAY_TMN_CODE
        vnp_HashSecret = settings.VNPAY_HASH_SECRET
        vnp_Url = settings.VNPAY_URL
        tz = timezone.get_current_timezone()

        input_data = {
            "vnp_TmnCode": vnp_TmnCode,
            "vnp_TransactionNo": payment.transaction_id,
            "vnp_Amount": str(int(float(payment.amount) * 100)),
            "vnp_TransactionDate": payment.created_at.strftime('%Y%m%d%H%M%S'),
            "vnp_CreateDate": timezone.now().strftime('%Y%m%d%H%M%S'),
            "vnp_IpAddr": "127.0.0.1",  # Có thể lấy từ request nếu cần
            "vnp_Command": "refund",
            "vnp_TransactionType": "02",  # Hoàn tiền toàn phần
            "vnp_OrderInfo": f"Hoan tien don hang {payment.order.order_code}"
        }

        sorted_data = sorted(input_data.items())
        query_string = '&'.join(f"{k}={quote_plus(str(v))}" for k, v in sorted_data if v)
        hash_data = '&'.join(f"{k}={quote_plus(str(v))}" for k, v in sorted_data if v and k != "vnp_SecureHash")

        secure_hash = hmac.new(
            bytes(vnp_HashSecret, 'utf-8'),
            bytes(hash_data, 'utf-8'),
            hashlib.sha512
        ).hexdigest()

        refund_url = f"{vnp_Url}?{query_string}&vnp_SecureHash={secure_hash}"
        response = requests.post(refund_url)
        response.raise_for_status()
        result = response.json()

        if result.get("vnp_ResponseCode") == "00":
            return {"success": True}
        else:
            return {"success": False, "message": result.get("vnp_Message", "Refund failed")}
    except Exception as e:
        return {"success": False, "message": f"Error processing VNPay refund: {str(e)}"}

def generate_reset_code(uidb64, token):
    """Tạo mã code 6 ký tự từ uidb64 và token."""
    import hashlib
    combined = f"{uidb64}{token}".encode('utf-8')
    hash_object = hashlib.sha256(combined)
    code = hash_object.hexdigest()[:6].upper()  # Lấy 6 ký tự đầu, chuyển thành chữ hoa
    return code
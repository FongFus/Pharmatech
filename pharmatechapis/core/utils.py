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
import requests
from bs4 import BeautifulSoup
import markdownify
import chromadb
from llama_index.core import VectorStoreIndex, Document, StorageContext
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.llms.gemini import Gemini
from llama_index.embeddings.gemini import GeminiEmbedding
import google.generativeai as genai
import logging
import asyncio

logger = logging.getLogger(__name__)

# Firebase Initialization
if not firebase_admin._apps:
    cred = credentials.Certificate(settings.FIREBASE_ADMIN_CREDENTIALS)
    firebase_admin.initialize_app(cred, {
        'databaseURL': settings.FIREBASE_CONFIG['databaseURL']
    })

# --- Firebase Utilities ---
async def create_firebase_user(email, password, user_id, role):
    try:
        firebase = pyrebase.initialize_app(settings.FIREBASE_CONFIG)
        auth = firebase.auth()
        user = await sync_to_async(auth.create_user_with_email_and_password)(email, password)
        await sync_to_async(admin_auth.set_custom_user_claims)(user['localId'], {'role': role})
        return {'success': True, 'user': user}
    except Exception as e:
        return {'success': False, 'message': f"Lỗi khi tạo người dùng Firebase: {str(e)}"}

async def create_django_and_firebase_user(username, email, password, role, **extra_fields):
    User = get_user_model()
    user = await sync_to_async(User.objects.create_user)(
        username=username, email=email, password=password, role=role, **extra_fields
    )
    firebase_result = await create_firebase_user(email, password, user.id, role)
    if not firebase_result['success']:
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
                await sync_to_async(messaging.send)(message)
            except messaging.FirebaseError as e:
                if 'not-registered' in str(e):
                    invalid_tokens.append(token.token)
        if invalid_tokens:
            await sync_to_async(DeviceToken.objects.filter(token__in=invalid_tokens).delete)()
        return {'success': True, 'message': 'Thông báo đã được gửi.'}
    except Exception as e:
        return {'success': False, 'message': f"Lỗi khi gửi FCM: {str(e)}"}

def get_messages_from_firebase(conversation_id, user_id, limit=50):
    try:
        ref = db.reference(f'chat_messages/{conversation_id}')
        messages_data = ref.get()
        if not messages_data:
            return []
        messages = []
        for key, msg in messages_data.items():
            if msg.get('user_id') == str(user_id):
                cleaned_response = extract_main_guidance(msg.get('response', ''))
                messages.append({
                    'message': msg.get('message', ''),
                    'response': cleaned_response,
                    'timestamp': msg.get('timestamp', ''),
                    'message_type': msg.get('message_type', 'user')
                })
        messages.sort(key=lambda x: x['timestamp'])
        return messages[-limit:]
    except Exception as e:
        raise Exception(f"Lỗi khi lấy tin nhắn từ Firebase: {str(e)}")

def extract_main_guidance(response_text):
    if not response_text:
        return "Vui lòng cung cấp thêm thông tin để được hỗ trợ tốt hơn."
    keywords = ["**Trả lời:**", "Response (Vietnamese):", "Lời khuyên sơ bộ:"]
    for kw in keywords:
        if kw in response_text:
            parts = response_text.split(kw, 1)
            if len(parts) > 1:
                guidance = parts[1].strip()
                if guidance.startswith('"') and guidance.endswith('"'):
                    guidance = guidance[1:-1]
                sentences = guidance.split('.')
                if len(sentences) > 3:
                    guidance = '.'.join(sentences[:3]) + '.'
                return guidance
    sentences = response_text.split('.')
    if len(sentences) > 3:
        guidance = '.'.join(sentences[:3]) + '.'
    else:
        guidance = response_text
    if not guidance.endswith('.'):
        return "Vui lòng cung cấp thêm thông tin để được hỗ trợ tốt hơn."
    return guidance

# --- Stripe Utilities ---
stripe.api_key = settings.STRIPE_SECRET_KEY

def create_stripe_checkout_session(order, user):
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
    try:
        refund = stripe.Refund.create(
            payment_intent=payment.transaction_id,
            amount=int(float(payment.amount) * 100),
            reason='requested_by_customer',
        )
        return {'success': True, 'refund_id': refund.id}
    except stripe.error.StripeError as e:
        return {'success': False, 'message': f"Lỗi khi hoàn tiền: {str(e)}"}

# --- Password Reset Utility ---
def generate_reset_code(uidb64, token):
    combined = f"{uidb64}{token}".encode('utf-8')
    hash_object = hashlib.sha256(combined)
    code = hash_object.hexdigest()[:6].upper()
    return code

# --- Web Scraping Utilities ---
async def scrape_website(url):
    """
    Cào dữ liệu từ một trang web và chuyển đổi sang Markdown.
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0'
        }
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=10) as response:
                response.raise_for_status()
                text = await response.text()
        
        soup = BeautifulSoup(text, 'html.parser')
        for element in soup(['script', 'style', 'nav', 'footer']):
            element.decompose()
        
        main_content = soup.find('main') or soup.find('article') or soup.find('div', class_='content')
        if not main_content:
            main_content = soup.body
        
        markdown_content = markdownify.markdownify(str(main_content), heading_style="ATX")
        
        return {
            'success': True,
            'url': url,
            'content': markdown_content,
            'metadata': {
                'title': soup.title.string if soup.title else 'No title',
                'source': url
            }
        }
    except aiohttp.ClientError as e:
        logger.error(f"Lỗi khi cào dữ liệu từ {url}: {str(e)}")
        return {'success': False, 'url': url, 'error': str(e)}
    except Exception as e:
        logger.error(f"Lỗi không xác định khi cào dữ liệu từ {url}: {str(e)}")
        return {'success': False, 'url': url, 'error': str(e)}
        
# --- Vector Store Utilities ---
def initialize_vector_store():
    """
    Khởi tạo ChromaDB và LlamaIndex vector store.
    """
    try:
        chroma_client = chromadb.PersistentClient(path="./chroma_db")
        chroma_collection = chroma_client.get_or_create_collection("healthcare_data")
        
        embed_model = GeminiEmbedding(
            api_key=settings.GEMINI_API_KEY,
            model_name="models/embedding-001"
        )
        
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        
        index = VectorStoreIndex.from_vector_store(
            vector_store=vector_store,
            embed_model=embed_model
        )
        return index, chroma_collection
    except Exception as e:
        logger.error(f"Lỗi khi khởi tạo vector store: {str(e)}")
        raise

def store_scraped_data(scraped_data):
    """
    Lưu dữ liệu đã cào vào ChromaDB.
    """
    try:
        # Kiểm tra dữ liệu đầu vào
        if not scraped_data.get('success'):
            return {'success': False, 'error': 'Dữ liệu cào không hợp lệ.'}
        
        # Tạo client ChromaDB
        chroma_client = chromadb.PersistentClient(path="./chroma_db")
        chroma_collection = chroma_client.get_or_create_collection("pharmatech_collection")

        # Tạo vector store
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)

        # Tạo document từ dữ liệu cào
        document = Document(
            text=scraped_data['content'],
            metadata=scraped_data['metadata']
        )

        # Lưu vào ChromaDB
        index = VectorStoreIndex.from_documents(
            [document],
            storage_context=storage_context
        )
        index.storage_context.persist(persist_dir="./chroma_db")

        logger.info(f"Đã lưu dữ liệu từ {scraped_data['url']} vào ChromaDB")
        return {'success': True}
    except Exception as e:
        logger.error(f"Lỗi khi lưu dữ liệu vào ChromaDB: {str(e)}")
        return {'success': False, 'error': str(e)}

# --- Chatbot Utilities ---
async def call_gemini_api(message, conversation_id=None, user_id=None):
    """
    Gọi Gemini API với ngữ cảnh từ ChromaDB và lịch sử hội thoại.
    """
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-pro')
        
        # Lấy lịch sử hội thoại từ Firebase
        previous_messages = []
        if conversation_id and user_id:
            try:
                messages = await sync_to_async(get_messages_from_firebase)(conversation_id, user_id, limit=4)
                previous_messages = messages[-4:]
            except Exception:
                previous_messages = []
        
        conversation_history = ""
        total_history_length = 0
        for msg in previous_messages:
            msg_text = msg['message'] if msg['message_type'] == 'user' else msg['response']
            if total_history_length + len(msg_text) <= 2000:
                role = "Người dùng" if msg['message_type'] == 'user' else "Trợ lý"
                conversation_history += f"{role}: {msg_text}\n"
                total_history_length += len(msg_text)
        
        # Lấy ngữ cảnh từ ChromaDB
        index, _ = initialize_vector_store()
        query_engine = index.as_query_engine()
        context = await asyncio.to_thread(query_engine.query, message)
        context_text = str(context)[:4000]
        
        prompt = (
            f"Bạn là một trợ lý y tế thông minh, trả lời bằng tiếng Việt. "
            f"Không chẩn đoán bệnh, chỉ cung cấp thông tin và hướng dẫn sơ bộ. "
            f"Ngữ cảnh từ dữ liệu cào web:\n{context_text}\n"
            f"Lịch sử hội thoại:\n{conversation_history}\n"
            f"Người dùng: {message}"
        )
        
        response = await asyncio.to_thread(model.generate_content, prompt)
        response_text = response.text[:1000]
        
        return {
            'success': True,
            'response': response_text,
            'context': context_text
        }
    except Exception as e:
        logger.error(f"Lỗi khi gọi Gemini API: {str(e)}")
        return {'success': False, 'error': str(e)}
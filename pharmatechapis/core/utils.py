import aiohttp
from django.utils import timezone
import firebase_admin
from firebase_admin import auth as admin_auth, messaging, credentials, db
from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from .models import DeviceToken
import hashlib
import stripe
import asyncio
import os
import hmac
from urllib.parse import quote_plus
import pyrebase
import requests
from bs4 import BeautifulSoup
import markdownify
import chromadb
from llama_index.core import VectorStoreIndex, Document, StorageContext
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.gemini import GeminiEmbedding
from llama_index.llms.gemini import Gemini
from llama_index.core import Settings
import logging
import time
import random

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
    if not response_text or not response_text.strip():
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
                return guidance if guidance else response_text
    sentences = response_text.split('.')
    if len(sentences) > 3:
        guidance = '.'.join(sentences[:3]) + '.'
    else:
        guidance = response_text
    # Chỉ fallback nếu guidance thực sự rỗng
    if not guidance or not guidance.strip():
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
        def fetch():
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            return response.text

        text = await asyncio.get_event_loop().run_in_executor(None, fetch)

        soup = BeautifulSoup(text, 'html.parser')
        for element in soup(['script', 'style', 'nav', 'footer']):
            element.decompose()

        main_content = soup.find('main') or soup.find('article') or soup.find('div', class_='content')
        if not main_content:
            main_content = soup.body

        markdown_content = markdownify.markdownify(str(main_content), heading_style="ATX")
        
        # Kiểm tra và log kiểu dữ liệu
        logger.debug(f"scrape_website: url={url}, type(markdown_content)={type(markdown_content)}, length={len(markdown_content)}")
        
        return {
            'success': True,
            'url': url,
            'content': markdown_content,
            'metadata': {
                'title': soup.title.string if soup.title else 'No title',
                'source': url
            }
        }
    except requests.RequestException as e:
        logger.error(f"Lỗi khi cào dữ liệu từ {url}: {str(e)}")
        return {'success': False, 'url': url, 'error': str(e)}
    except Exception as e:
        logger.error(f"Lỗi không xác định khi cào dữ liệu từ {url}: {str(e)}")
        return {'success': False, 'url': url, 'error': str(e)}
        
# --- Vector Store Utilities ---
def initialize_vector_store():
    """
    Khởi tạo ChromaDB và VectorStoreIndex.
    """
    try:
        # Khởi tạo ChromaDB client
        chroma_client = chromadb.PersistentClient(path="./chroma_db")
        logger.info("Đã khởi tạo ChromaDB client")
        
        # Tạo hoặc lấy collection
        try:
            chroma_collection = chroma_client.get_collection("pharmatech_collection")
            logger.info("Đã lấy collection pharmatech_collection")
        except Exception:
            chroma_collection = chroma_client.create_collection("pharmatech_collection")
            logger.info("Đã tạo collection pharmatech_collection")
        
        # Khởi tạo vector store
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        
        # Khởi tạo index
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
        logger.info("Đã khởi tạo VectorStoreIndex")
        
        return index, chroma_collection
    except Exception as e:
        logger.error(f"Lỗi khi khởi tạo vector store: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

def store_scraped_data(data):
    """
    Lưu dữ liệu đã cào vào ChromaDB.
    """
    max_retries = 5
    retry_delay = 1  # Bắt đầu với 1 giây

    for attempt in range(max_retries):
        try:
            if not hasattr(Settings, 'embed_model') or not isinstance(Settings.embed_model, GeminiEmbedding):
                Settings.embed_model = GeminiEmbedding(
                    api_key=settings.GEMINI_API_KEY,
                    model_name="models/gemini-embedding-001"
                )
                logger.info("Đã cấu hình GeminiEmbedding trong store_scraped_data với models/gemini-embedding-001")

            content = data.get('content')
            url = data.get('url')
            if not content or not url:
                logger.error(f"Dữ liệu không hợp lệ: content={len(content) if content else None}, url={url}")
                return {'success': False, 'error': 'Dữ liệu không hợp lệ'}

            # Nếu content là list, nối lại thành chuỗi
            if isinstance(content, list):
                content = '\n'.join([str(c) for c in content])
            # Nếu không phải chuỗi, chuyển về chuỗi
            if not isinstance(content, str):
                content = str(content)
            content = content[:10000]  # Giới hạn 10,000 ký tự

            # Khởi tạo vector store
            index, _ = initialize_vector_store()

            # Tạo Document với doc_id rõ ràng
            document = Document(
                text=content,
                metadata={'url': url},
                doc_id=url
            )
            logger.debug(f"Document type after creation: {type(document)}; value: {document}")
            if isinstance(document, list):
                logger.error(f"Document is a list after creation. Elements:")
                for i, doc_item in enumerate(document):
                    logger.error(f"  [{i}] type: {type(doc_item)}, value: {doc_item}")
                return {'success': False, 'error': 'Document is a list after creation'}
            if not isinstance(document, Document):
                logger.error(f"Document is not a Document instance: {type(document)}; value: {document}")
                return {'success': False, 'error': 'Document is not a Document instance'}
            
            logger.debug(f"Index type: {type(index)}")
            logger.debug(f"index.insert input type: {type([document])}, content: {[type(document) for document in [document]]}")
            try:
                index.insert([document])
            except Exception as e:
                logger.error(f"index.insert([document]) failed: {str(e)}. Trying index.insert(document) directly.")
                try:
                    index.insert(document)
                    logger.info(f"Đã chèn document trực tiếp từ {url} vào ChromaDB")
                except Exception as e2:
                    logger.error(f"index.insert(document) also failed: {str(e2)}")
                    return {'success': False, 'error': f'index.insert error: {str(e)} / {str(e2)}'}
            logger.info(f"Đã chèn document từ {url} vào ChromaDB")
            
            logger.info(f"Đã lưu dữ liệu từ {url} vào ChromaDB")
            return {'success': True}
        except Exception as e:
            if "429" in str(e) and attempt < max_retries - 1:
                logger.warning(f"Lỗi 429, thử lại sau {retry_delay} giây...")
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
                retry_delay += random.uniform(0, 0.1)  # Jitter
                continue
            logger.error(f"Lỗi khi lưu dữ liệu vào ChromaDB: {str(e)}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

# --- Chatbot Utilities ---
async def call_gemini_api(message, conversation_id=None, user_id=None):
    """
    Gọi Gemini API với ngữ cảnh từ ChromaDB và lịch sử hội thoại.
    """
    if len(message) > 1000:
        raise ValueError("Tin nhắn quá dài, tối đa 1000 ký tự.")

    try:
        gemini_llm = Gemini(api_key=settings.GEMINI_API_KEY, model_name="models/gemini-2.0-flash")
    except Exception as e:
        logger.error(f"Lỗi khi khởi tạo Gemini LLM: {str(e)}")
        return {'success': False, 'error': f"Lỗi khi khởi tạo Gemini LLM: {str(e)}"}

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
    retriever = index.as_retriever(similarity_top_k=2)
    nodes = await asyncio.to_thread(retriever.retrieve, message)
    context_text = "\n".join([node.node.text for node in nodes])[:4000]

    prompt = (
        f"Bạn là một trợ lý y tế thông minh, trả lời bằng tiếng Việt. "
        f"Bạn không thực hiện chẩn đoán bệnh, chỉ cung cấp thông tin tham khảo và hướng dẫn sơ bộ. "
        f"Chỉ sử dụng thông tin có trong ngữ cảnh sau đây để đưa ra câu trả lời:\n"
        f"{context_text}\n"
        f"Nếu câu hỏi không liên quan đến nội dung trong ngữ cảnh trên, hãy trả lời đúng một câu: "
        f"\"Hệ thống không có dữ liệu về câu hỏi của bạn.\" và không cung cấp thêm bất kỳ lời giải thích hay suy đoán nào.\n"
        f"Lịch sử hội thoại:\n{conversation_history}\n"
        f"Người dùng: {message}"
    )

    try:
        response = await asyncio.to_thread(gemini_llm.complete, prompt)
        response_text = response.text[:1000] if response and hasattr(response, 'text') else ""
        logger.debug(f"Gemini response: {response_text}")
        if not response_text or not response_text.strip():
            logger.warning("Gemini LLM trả về response rỗng hoặc không hợp lệ, fallback.")
            response_text = "Vui lòng cung cấp thêm thông tin để được hỗ trợ tốt hơn."
        return {
            'success': True,
            'response': response_text,
            'context': context_text
        }
    except Exception as e:
        logger.error(f"Lỗi khi gọi Gemini LLM complete: {str(e)}")
        return {'success': False, 'error': str(e)}

import json
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer
from .utils import call_gemini_api, save_message_to_firebase, get_messages_from_firebase, extract_main_guidance
from oauth2_provider.models import AccessToken
from asgiref.sync import sync_to_async
from firebase_admin import exceptions as firebase_exceptions
from aiohttp import ClientError as AiohttpClientError
import logging

logger = logging.getLogger(__name__)

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Lấy conversation_id từ URL hoặc tạo mới nếu không có
        original_conversation_id = self.scope['url_route']['kwargs'].get('conversation_id')
        if not original_conversation_id or original_conversation_id == 'new':
            self.conversation_id = str(uuid.uuid4())
            self.is_new_conversation = True
        else:
            # Xác thực conversation_id là UUID hợp lệ
            try:
                uuid.UUID(original_conversation_id)
                self.conversation_id = original_conversation_id
                self.is_new_conversation = False
            except ValueError:
                await self.send(text_data=json.dumps({'error': 'conversation_id không hợp lệ.'}))
                await self.close(code=4002)
                return
        
        self.user = self.scope['user']
        
        if not self.user.is_authenticated:
            # Kiểm tra token từ query string
            query_string = self.scope.get('query_string', b'').decode()
            token = None
            for param in query_string.split('&'):
                if param.startswith('token='):
                    token = param.split('=')[1]
                    break
            if token:
                try:
                    # Bọc synchronous database call
                    access_token = await sync_to_async(AccessToken.objects.get)(token=token)
                    if access_token.is_valid() and not access_token.is_expired():
                        self.user = await sync_to_async(lambda: access_token.user)()
                        # Kiểm tra quyền sở hữu conversation_id
                        if not self.is_new_conversation:
                            messages = await get_messages_from_firebase(self.conversation_id, self.user.id, limit=1)
                            if not messages:
                                await self.send(text_data=json.dumps({'error': 'Không có quyền truy cập hội thoại.'}))
                                await self.close(code=4002)
                                return
                        await self.accept()
                        # Gửi conversation_id mới về client
                        await self.send(text_data=json.dumps({
                            'conversation_id': self.conversation_id,
                            'message': 'Kết nối thành công, hội thoại mới đã được tạo.'
                        }))
                        if not self.is_new_conversation:
                            await self.send_previous_messages()
                    else:
                        await self.send(text_data=json.dumps({'error': 'Token không hợp lệ hoặc đã hết hạn.'}))
                        await self.close(code=4001)
                except AccessToken.DoesNotExist:
                    await self.send(text_data=json.dumps({'error': 'Token không tồn tại.'}))
                    await self.close(code=4001)
            else:
                await self.send(text_data=json.dumps({'error': 'Yêu cầu token xác thực.'}))
                await self.close(code=4001)
        else:
            # Kiểm tra quyền sở hữu conversation_id
            if not self.is_new_conversation:
                messages = await get_messages_from_firebase(self.conversation_id, self.user.id, limit=1)
                if not messages:
                    await self.send(text_data=json.dumps({'error': 'Không có quyền truy cập hội thoại.'}))
                    await self.close(code=4002)
                    return
            await self.accept()
            # Gửi conversation_id về client
            await self.send(text_data=json.dumps({
                'conversation_id': self.conversation_id,
                'message': 'Kết nối thành công.'
            }))
            if not self.is_new_conversation:
                await self.send_previous_messages()

    async def send_previous_messages(self):
        try:
            # Giới hạn 10 tin nhắn gần nhất để tối ưu hiệu suất
            messages = await get_messages_from_firebase(self.conversation_id, self.user.id, limit=10)
            await self.send(text_data=json.dumps({
                'previous_messages': messages
            }))
        except Exception as e:
            logger.error(f"Lỗi khi tải lịch sử tin nhắn cho conversation_id {self.conversation_id}: {str(e)}")
            await self.send(text_data=json.dumps({'error': f"Lỗi khi tải lịch sử tin nhắn: {str(e)}"}))

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message = text_data_json.get('message')
        if not message:
            await self.send(text_data=json.dumps({'error': 'Tin nhắn không được để trống.'}))
            return

        try:
            # Gọi Gemini API với context từ ChromaDB
            result = await call_gemini_api(message, self.conversation_id, self.user.id)
            if not result['success']:
                logger.error(f"Lỗi từ Gemini API: {result['error']}")
                await self.send(text_data=json.dumps({'error': result['error']}))
                return

            response_text = result['response']
            # Trích xuất phần hướng dẫn chính từ phản hồi
            main_guidance = extract_main_guidance(response_text)

            # Lưu tin nhắn vào Firebase
            result = save_message_to_firebase(str(self.user.id), self.conversation_id, message, main_guidance)
            if not result['success']:
                logger.error(f"Lỗi lưu tin nhắn Firebase: {result['message']}")
                await self.send(text_data=json.dumps({'error': result['message']}))
                return

            # Gửi phản hồi qua WebSocket
            await self.send(text_data=json.dumps({
                'conversation_id': self.conversation_id,
                'message': message,
                'response': main_guidance
            }))
            # FCM đã bị vô hiệu hóa cho tính năng chat để tránh lỗi token thiết bị
            # fcm_result = await send_fcm_v1(self.user, "Phản hồi chatbot", main_guidance)
            # if not fcm_result['success']:
            #     logger.error(f"Lỗi gửi FCM: {fcm_result['message']}")
        except AiohttpClientError as e:
            logger.error(f"Lỗi kết nối Gemini API: {str(e)}")
            await self.send(text_data=json.dumps({'error': f"Lỗi kết nối Gemini API: {str(e)}"}))
        except firebase_exceptions.FirebaseError as e:
            logger.error(f"Lỗi Firebase: {str(e)}")
            await self.send(text_data=json.dumps({'error': f"Lỗi Firebase: {str(e)}"}))
        except Exception as e:
            logger.error(f"Lỗi không xác định: {str(e)}")
            await self.send(text_data=json.dumps({'error': f"Lỗi không xác định: {str(e)}"}))
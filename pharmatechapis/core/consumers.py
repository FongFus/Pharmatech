import json
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer
from .utils import call_gemini_api, save_message_to_firebase, send_fcm_v1
from oauth2_provider.models import AccessToken
from asgiref.sync import sync_to_async
from firebase_admin import exceptions as firebase_exceptions
from aiohttp import ClientError as AiohttpClientError

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Lấy conversation_id từ URL hoặc tạo mới nếu không có
        conversation_id = self.scope['url_route']['kwargs'].get('conversation_id')
        if not conversation_id or conversation_id == 'new':
            conversation_id = str(uuid.uuid4())
        
        self.conversation_id = conversation_id
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
                        await self.accept()
                        # Gửi conversation_id mới về client
                        await self.send(text_data=json.dumps({
                            'conversation_id': self.conversation_id,
                            'message': 'Kết nối thành công, hội thoại mới đã được tạo.'
                        }))
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
            await self.accept()
            # Gửi conversation_id về client
            await self.send(text_data=json.dumps({
                'conversation_id': self.conversation_id,
                'message': 'Kết nối thành công.'
            }))

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message = text_data_json.get('message')
        if not message:
            await self.send(text_data=json.dumps({'error': 'Tin nhắn không được để trống.'}))
            return

        try:
            response_text = await call_gemini_api(message)  # Bây giờ là async
            result = save_message_to_firebase(str(self.user.id), self.conversation_id, message, response_text)
            if not result['success']:
                await self.send(text_data=json.dumps({'error': result['message']}))
                return

            await self.send(text_data=json.dumps({
                'conversation_id': self.conversation_id,
                'message': message,
                'response': response_text
            }))
            await send_fcm_v1(self.user, "Phản hồi chatbot", response_text)  # Bây giờ là async
        except AiohttpClientError as e:
            await self.send(text_data=json.dumps({'error': f"Lỗi kết nối Gemini API: {str(e)}"}))
        except firebase_exceptions.FirebaseError as e:
            await self.send(text_data=json.dumps({'error': f"Lỗi Firebase: {str(e)}"}))
        except Exception as e:
            await self.send(text_data=json.dumps({'error': f"Lỗi không xác định: {str(e)}"}))
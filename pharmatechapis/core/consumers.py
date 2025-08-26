from channels.generic.websocket import AsyncWebsocketConsumer
import json
from .utils import call_gemini_api, save_message_to_firebase, send_fcm_v1
from oauth2_provider.models import AccessToken

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
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
                    access_token = AccessToken.objects.get(token=token)
                    if access_token.is_valid():
                        self.user = access_token.user
                        await self.accept()
                    else:
                        await self.close(code=4001)
                except AccessToken.DoesNotExist:
                    await self.close(code=4001)
            else:
                await self.close(code=4001)
        else:
            await self.accept()

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message = text_data_json.get('message')
        if not message:
            await self.send(text_data=json.dumps({'error': 'Tin nhắn không được để trống.'}))
            return

        try:
            response_text = call_gemini_api(message)
            result = save_message_to_firebase(str(self.user.id), self.conversation_id, message, response_text)
            if not result['success']:
                await self.send(text_data=json.dumps({'error': result['message']}))
                return

            await self.send(text_data=json.dumps({
                'conversation_id': self.conversation_id,
                'message': message,
                'response': response_text
            }))

            send_fcm_v1(self.user, "Phản hồi chatbot", response_text)
        except Exception as e:
            await self.send(text_data=json.dumps({'error': f"Lỗi: {str(e)}"}))
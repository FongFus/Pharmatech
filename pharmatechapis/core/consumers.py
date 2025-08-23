# core/consumers.py
from channels.generic.websocket import AsyncWebsocketConsumer
import json
from .utils import call_gemini_api, save_message_to_firebase, send_fcm_v1
import uuid

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.user = self.scope['user']
        if not self.user.is_authenticated:
            await self.close()
            return
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
            # Gọi Gemini API để lấy phản hồi
            response_text = call_gemini_api(message)
            # Lưu tin nhắn và phản hồi vào Firebase
            result = save_message_to_firebase(self.user.id, self.conversation_id, message, response_text)
            if not result['success']:
                await self.send(text_data=json.dumps({'error': result['message']}))
                return

            # Gửi phản hồi qua WebSocket
            await self.send(text_data=json.dumps({
                'conversation_id': self.conversation_id,
                'message': message,
                'response': response_text
            }))

            # Gửi thông báo FCM
            send_fcm_v1(self.user, "Phản hồi chatbot", response_text)
        except Exception as e:
            await self.send(text_data=json.dumps({'error': f"Lỗi: {str(e)}"}))
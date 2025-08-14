import json
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from django.conf import settings
from django.utils import timezone
import os
import pyrebase

FIREBASE_SERVICE_ACCOUNT_FILE = os.path.join(
    settings.BASE_DIR, 'core', 'pharmatech-firebase-adminsdk.json'
)

FIREBASE_PROJECT_ID = 'pharmatech-app'

firebase = pyrebase.initialize_app(settings.FIREBASE_CONFIG)
db = firebase.database()

def get_access_token():
    credentials = service_account.Credentials.from_service_account_file(
        FIREBASE_SERVICE_ACCOUNT_FILE,
        scopes=["https://www.googleapis.com/auth/firebase.messaging"]
    )
    credentials.refresh(Request())
    return credentials.token

def send_fcm_v1(user, title, body, data=None):
    from .models import DeviceToken
    tokens = list(DeviceToken.objects.filter(user=user).values_list('token', flat=True))
    if not tokens:
        return
    access_token = get_access_token()
    url = f"https://fcm.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/messages:send"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; UTF-8",
    }
    data_str = {str(k): str(v) for k, v in (data or {}).items()}
    for token in tokens:
        message = {
            "message": {
                "token": token,
                "notification": {
                    "title": title,
                    "body": body,
                },
                "data": data_str
            }
        }
        response = requests.post(url, headers=headers, data=json.dumps(message))
        print(f"FCM v1 response for {user.username}: {response.status_code} {response.text}")

def save_message_to_firebase(user_id, conversation_id, message, response):
    data = {
        'user_id': user_id,
        'message': message,
        'response': response,
        'timestamp': timezone.now().isoformat()
    }
    db.child('chat_messages').child(conversation_id).push(data)
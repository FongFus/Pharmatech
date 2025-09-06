from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/chat/(?P<conversation_id>[^/]+)/$', consumers.ChatConsumer.as_asgi()),
    re_path(r'ws/chat/$', consumers.ChatConsumer.as_asgi(), {'conversation_id': 'new'}),
    re_path(r'ws/chat/new/$', consumers.ChatConsumer.as_asgi(), {'conversation_id': 'new'}),
]
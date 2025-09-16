from celery import Celery
import os

# Đặt biến môi trường cho Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pharmatech.settings')

# Tạo instance Celery
app = Celery('pharmatech')

# Tải cấu hình từ settings.py với namespace 'CELERY'
app.config_from_object('django.conf:settings', namespace='CELERY')

# Tự động khám phá các task trong các ứng dụng Django
app.autodiscover_tasks()
import requests
from django.conf import settings

GEMINI_API_KEY = settings.GEMINI_API_KEY
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
            f'{GEMINI_API_URL}?key={GEMINI_API_KEY}',
            headers=headers,
            json=data
        )
        response.raise_for_status()
        result = response.json()
        return result['candidates'][0]['content']['parts'][0]['text']
    except requests.exceptions.RequestException as e:
        raise Exception(f"Lỗi khi gọi Gemini API: {str(e)}")
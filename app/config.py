import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "ShigaChat.db")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OpenAI.api_key = OPENAI_API_KEY

language_mapping = {
    "日本語": 1,
    "English": 2,
    "Tiếng Việt": 3,
    "中文": 4,
    "한국어": 5,
    "Português": 6,
    "Español": 7,
    "Tagalog": 8,
    "Bahasa Indonesia": 9,
}

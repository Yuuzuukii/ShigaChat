import os
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "dbname": os.getenv("PG_DATABASE"),
    "user": os.getenv("PG_USER"),
    "password": os.getenv("PG_PASSWORD"),
    "host": os.getenv("PG_HOST", "localhost"),
    "port": os.getenv("PG_PORT", 5432)
}


LANGUAGE_MAP = {
    "ja": 1,
    "en": 2,
    "vi": 3,
    "zh": 4,
    "ko": 5,
    "pt": 6,
    "es": 7,
    "tl": 8,
    "id": 9,
}
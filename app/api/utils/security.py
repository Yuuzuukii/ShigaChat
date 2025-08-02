from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
import regex as re
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from config import SECRET_KEY

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # トークンの有効期限（分）
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/user/token")

# パスワードをハッシュ化する関数
def hash_password(password: str):
    return pwd_context.hash(password)

# パスワードが正しいかを確認する関数
def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=30))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def detect_privacy_info(text: str) -> list:
    # 検出したいプライバシー情報の正規表現パターン
    patterns = {
        "電話番号": r"\b\d{2,4}-\d{2,4}-\d{4}\b",  # 電話番号 (ハイフン付き)
        "メールアドレス": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",  # メールアドレス
        "郵便番号": r"\b〒?\d{3}-\d{4}\b",  # 郵便番号 (〒123-4567 または 123-4567)
        "カード番号": r"\b(?:\d[ -]*?){13,16}\b",  # クレジットカード番号（13〜16桁）
    }

    detected = []
    for pii_type, pattern in patterns.items():
        matches = re.findall(pattern, text)
        if matches:
            detected.extend([(pii_type, match) for match in matches])

    return detected

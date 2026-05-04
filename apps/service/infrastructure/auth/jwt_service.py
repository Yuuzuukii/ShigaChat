from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any

from jose import JWTError, jwt


class JwtService:
    algorithm = "HS256"

    def __init__(self, secret_key: str | None = None, expire_minutes: int = 480) -> None:
        self.secret_key = secret_key or os.getenv("SECRET_KEY") or "change-me"
        self.expire_minutes = expire_minutes

    def create_access_token(self, data: dict[str, Any]) -> str:
        payload = data.copy()
        payload["exp"] = datetime.utcnow() + timedelta(minutes=self.expire_minutes)
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def verify(self, token: str) -> dict[str, Any]:
        try:
            return jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
        except JWTError as exc:
            raise ValueError("Invalid token") from exc

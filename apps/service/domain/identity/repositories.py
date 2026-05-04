from __future__ import annotations

from typing import Protocol

from domain.identity.models import User
from domain.shared.language import LanguageCode


class UserRepository(Protocol):
    def find_by_id(self, user_id: int) -> User | None: ...

    def find_by_name(self, name: str) -> User | None: ...

    def create(self, name: str, password_hash: str, language: LanguageCode) -> User: ...

    def update_language(self, user_id: int, language: LanguageCode) -> None: ...

    def delete_by_name(self, name: str) -> None: ...

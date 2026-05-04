from dataclasses import dataclass

from domain.shared.language import LanguageCode


@dataclass(frozen=True)
class User:
    id: int
    name: str
    password_hash: str
    language: LanguageCode

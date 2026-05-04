from dataclasses import dataclass

from domain.shared.language import LanguageCode


@dataclass(frozen=True)
class Actor:
    user_id: int
    language: LanguageCode
    role: str = "user"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

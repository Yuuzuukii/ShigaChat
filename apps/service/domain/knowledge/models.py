from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from domain.shared.language import LanguageCode


@dataclass(frozen=True)
class Category:
    id: int
    slug: str | None
    names: dict[str, str]

    def name_for(self, language: LanguageCode) -> str:
        return self.names.get(language.value) or self.names.get("ja") or next(iter(self.names.values()), "")


@dataclass(frozen=True)
class QATranslation:
    language: LanguageCode
    title: str
    question: str
    answer: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "question": self.question,
            "answer": self.answer,
        }


@dataclass(frozen=True)
class QA:
    id: int
    question_id: int
    answer_id: int
    category_id: int
    public: bool
    created_at: datetime | None
    translations: dict[str, QATranslation]

    def translation_for(self, language: LanguageCode) -> QATranslation | None:
        return self.translations.get(language.value) or self.translations.get("ja")

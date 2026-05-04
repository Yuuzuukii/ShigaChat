from __future__ import annotations

from typing import Protocol

from domain.knowledge.models import Category, QA
from domain.shared.language import LanguageCode


class CategoryRepository(Protocol):
    def find_by_id(self, category_id: int) -> Category | None: ...

    def list_all(self) -> list[Category]: ...


class QARepository(Protocol):
    def find_by_question_id(self, question_id: int, language: LanguageCode) -> QA | None: ...

    def list_by_category(self, category_id: int, language: LanguageCode, include_private: bool = False) -> list[QA]: ...

    def find_category_id_by_question_id(self, question_id: int) -> int | None: ...

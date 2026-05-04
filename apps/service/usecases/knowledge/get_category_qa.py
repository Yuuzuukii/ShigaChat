from __future__ import annotations

from domain.knowledge.repositories import CategoryRepository, QARepository
from domain.shared.actor import Actor
from domain.shared.errors import NotFoundError
from domain.shared.language import LanguageCode


class GetCategoryQAUseCase:
    def __init__(self, categories: CategoryRepository, qa: QARepository) -> None:
        self.categories = categories
        self.qa = qa

    def execute(self, actor: Actor, category_id: int, lang: str | None = None) -> dict:
        language = LanguageCode.from_any(lang) if lang else actor.language
        category = self.categories.find_by_id(category_id)
        if not category:
            raise NotFoundError("カテゴリが見つかりませんでした。")
        items = self.qa.list_by_category(category_id, language, include_private=actor.is_admin)
        questions = []
        for item in items:
            translation = item.translation_for(language)
            if not translation:
                continue
            questions.append(
                {
                    "question_id": item.question_id,
                    "answer_id": item.answer_id,
                    "質問": translation.question,
                    "回答": translation.answer,
                    "title": translation.title,
                    "time": item.created_at,
                }
            )
        if not questions:
            raise NotFoundError("該当する質問と回答が見つかりませんでした。")
        return {"category_name": category.name_for(language), "questions": questions}

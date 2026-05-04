from domain.knowledge.repositories import CategoryRepository
from domain.shared.actor import Actor
from domain.shared.errors import NotFoundError


class GetCategoryTranslationUseCase:
    def __init__(self, categories: CategoryRepository) -> None:
        self.categories = categories

    def execute(self, actor: Actor, category_id: int) -> dict:
        category = self.categories.find_by_id(category_id)
        if not category:
            raise NotFoundError("カテゴリが見つかりませんでした。")
        return {"カテゴリ名": {"description": category.name_for(actor.language)}}

from domain.knowledge.repositories import CategoryRepository
from domain.shared.actor import Actor


class ListCategoriesUseCase:
    def __init__(self, categories: CategoryRepository) -> None:
        self.categories = categories

    def execute(self, actor: Actor) -> dict:
        return {
            "categories": [
                {"id": category.id, "name": category.name_for(actor.language), "names": category.names}
                for category in self.categories.list_all()
            ]
        }

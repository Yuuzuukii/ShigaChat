from domain.knowledge.repositories import QARepository
from domain.shared.errors import NotFoundError


class GetCategoryByQuestionUseCase:
    def __init__(self, qa: QARepository) -> None:
        self.qa = qa

    def execute(self, question_id: int) -> dict:
        category_id = self.qa.find_category_id_by_question_id(question_id)
        if category_id is None:
            raise NotFoundError("質問が見つかりません")
        return {"category_id": category_id}

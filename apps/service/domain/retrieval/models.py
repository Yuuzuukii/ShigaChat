from dataclasses import dataclass


@dataclass(frozen=True)
class RetrievedReference:
    question_id: int
    category_id: int
    question: str
    answer: str

    def to_dict(self) -> dict:
        return {
            "question_id": self.question_id,
            "category_id": self.category_id,
            "question": self.question,
            "answer": self.answer,
        }

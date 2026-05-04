from domain.retrieval.models import RetrievedReference
from domain.shared.language import LanguageCode
from infrastructure.db.connection import cursor


class PostgresEmbeddingRepository:
    def search(self, query_vector: list[float], language: LanguageCode, top_k: int) -> list[RetrievedReference]:
        with cursor() as (cur, _conn):
            cur.execute(
                """
                SELECT qq.question_id, qq.category_id, q.texts AS question_text, a.texts AS answer_text
                FROM qa_embedding e
                JOIN question qq ON qq.question_id = e.question_id
                JOIN question_translation q ON q.question_id = e.question_id AND q.language_id = e.language_id
                JOIN answer_translation a ON a.answer_id = e.answer_id AND a.language_id = e.language_id
                WHERE e.language_id = %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (language.id, query_vector, top_k),
            )
            rows = cur.fetchall() or []
        return [
            RetrievedReference(
                question_id=int(row["question_id"]),
                category_id=int(row["category_id"]),
                question=row["question_text"],
                answer=row["answer_text"],
            )
            for row in rows
        ]

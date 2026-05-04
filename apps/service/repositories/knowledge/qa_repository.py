from __future__ import annotations

from collections import defaultdict

from domain.knowledge.models import QA, QATranslation
from domain.shared.language import LANGUAGE_ID_TO_CODE, LanguageCode
from infrastructure.db.connection import cursor


class PostgresQARepository:
    def find_by_question_id(self, question_id: int, language: LanguageCode) -> QA | None:
        with cursor() as (cur, _conn):
            cur.execute(
                """
                SELECT qa.id AS qa_id, q.question_id, qa.answer_id, q.category_id, q.public, q.time,
                       qt.language_id, qt.texts AS question_text, at.texts AS answer_text, q.title
                FROM qa
                JOIN question q ON q.question_id = qa.question_id
                JOIN question_translation qt ON qt.question_id = q.question_id
                JOIN answer_translation at ON at.answer_id = qa.answer_id AND at.language_id = qt.language_id
                WHERE q.question_id = %s
                """,
                (question_id,),
            )
            rows = cur.fetchall() or []
        return self._to_qa(rows) if rows else None

    def list_by_category(self, category_id: int, language: LanguageCode, include_private: bool = False) -> list[QA]:
        with cursor() as (cur, _conn):
            public_clause = "" if include_private else "AND q.public = TRUE"
            cur.execute(
                f"""
                SELECT qa.id AS qa_id, q.question_id, qa.answer_id, q.category_id, q.public, q.time,
                       qt.language_id, qt.texts AS question_text, at.texts AS answer_text, q.title
                FROM qa
                JOIN question q ON q.question_id = qa.question_id
                JOIN question_translation qt ON qt.question_id = q.question_id
                JOIN answer_translation at ON at.answer_id = qa.answer_id AND at.language_id = qt.language_id
                WHERE q.category_id = %s {public_clause}
                ORDER BY q.time DESC, q.question_id DESC
                """,
                (category_id,),
            )
            rows = cur.fetchall() or []
        grouped: dict[int, list[dict]] = defaultdict(list)
        for row in rows:
            grouped[int(row["qa_id"])].append(row)
        return [self._to_qa(group_rows) for group_rows in grouped.values()]

    def find_category_id_by_question_id(self, question_id: int) -> int | None:
        with cursor() as (cur, _conn):
            cur.execute("SELECT category_id FROM question WHERE question_id = %s", (question_id,))
            row = cur.fetchone()
        return int(row["category_id"]) if row else None

    def _to_qa(self, rows: list[dict]) -> QA:
        first = rows[0]
        translations = {}
        for row in rows:
            code = LANGUAGE_ID_TO_CODE.get(int(row["language_id"]), "ja")
            translations[code] = QATranslation(
                language=LanguageCode(code),
                title=row.get("title") or "",
                question=row.get("question_text") or "",
                answer=row.get("answer_text") or "",
            )
        return QA(
            id=int(first["qa_id"]),
            question_id=int(first["question_id"]),
            answer_id=int(first["answer_id"]),
            category_id=int(first["category_id"]),
            public=bool(first["public"]),
            created_at=first.get("time"),
            translations=translations,
        )

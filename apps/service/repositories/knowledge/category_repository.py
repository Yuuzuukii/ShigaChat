from __future__ import annotations

from domain.knowledge.models import Category
from domain.shared.language import LANGUAGE_ID_TO_CODE, LanguageCode
from infrastructure.db.connection import cursor


class PostgresCategoryRepository:
    def find_by_id(self, category_id: int) -> Category | None:
        with cursor() as (cur, _conn):
            cur.execute("SELECT id, description FROM category WHERE id = %s", (category_id,))
            row = cur.fetchone()
            if not row:
                return None
            names = self._names_for_category(cur, category_id, row["description"])
        return Category(id=int(row["id"]), slug=None, names=names)

    def list_all(self) -> list[Category]:
        with cursor() as (cur, _conn):
            cur.execute("SELECT id, description FROM category ORDER BY id")
            rows = cur.fetchall() or []
            categories = [
                Category(id=int(row["id"]), slug=None, names=self._names_for_category(cur, int(row["id"]), row["description"]))
                for row in rows
            ]
        return categories

    def _names_for_category(self, cur, category_id: int, fallback: str) -> dict[str, str]:
        cur.execute(
            "SELECT language_id, description FROM category_translation WHERE category_id = %s",
            (category_id,),
        )
        rows = cur.fetchall() or []
        names = {LANGUAGE_ID_TO_CODE.get(int(row["language_id"]), "ja"): row["description"] for row in rows}
        names.setdefault("ja", fallback)
        return names

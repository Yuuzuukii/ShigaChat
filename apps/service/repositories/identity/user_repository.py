from __future__ import annotations

from domain.identity.models import User
from domain.shared.language import LanguageCode
from infrastructure.db.connection import cursor


class PostgresUserRepository:
    def find_by_id(self, user_id: int) -> User | None:
        with cursor() as (cur, _conn):
            cur.execute('SELECT id, name, password, spoken_language FROM "user" WHERE id = %s', (user_id,))
            row = cur.fetchone()
        return self._to_user(row) if row else None

    def find_by_name(self, name: str) -> User | None:
        with cursor() as (cur, _conn):
            cur.execute('SELECT id, name, password, spoken_language FROM "user" WHERE name = %s', (name,))
            row = cur.fetchone()
        return self._to_user(row) if row else None

    def create(self, name: str, password_hash: str, language: LanguageCode) -> User:
        with cursor() as (cur, conn):
            cur.execute(
                'INSERT INTO "user" (name, password, spoken_language) VALUES (%s, %s, %s) RETURNING id, name, password, spoken_language',
                (name, password_hash, language.display_name),
            )
            row = cur.fetchone()
            conn.commit()
        return self._to_user(row)

    def update_language(self, user_id: int, language: LanguageCode) -> None:
        with cursor() as (cur, conn):
            cur.execute('UPDATE "user" SET spoken_language = %s WHERE id = %s', (language.display_name, user_id))
            conn.commit()

    def delete_by_name(self, name: str) -> None:
        with cursor() as (cur, conn):
            cur.execute('DELETE FROM "user" WHERE name = %s', (name,))
            conn.commit()

    def _to_user(self, row: dict) -> User:
        return User(
            id=int(row["id"]),
            name=row["name"],
            password_hash=row["password"],
            language=LanguageCode.from_any(row.get("spoken_language")),
        )

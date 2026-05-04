from __future__ import annotations

from datetime import datetime

from domain.conversation.models import Thread
from infrastructure.db.connection import cursor


class PostgresThreadRepository:
    def create(self, user_id: int) -> Thread:
        with cursor() as (cur, conn):
            cur.execute(
                "INSERT INTO threads (user_id, last_updated) VALUES (%s, %s) RETURNING id, user_id, thread_title, last_updated",
                (user_id, datetime.now()),
            )
            row = cur.fetchone()
            conn.commit()
        return self._to_thread(row)

    def find_by_id(self, thread_id: int) -> Thread | None:
        with cursor() as (cur, _conn):
            cur.execute("SELECT id, user_id, thread_title, last_updated FROM threads WHERE id = %s", (thread_id,))
            row = cur.fetchone()
        return self._to_thread(row) if row else None

    def list_by_user(self, user_id: int) -> list[Thread]:
        with cursor() as (cur, _conn):
            cur.execute(
                "SELECT id, user_id, thread_title, last_updated FROM threads WHERE user_id = %s ORDER BY last_updated DESC",
                (user_id,),
            )
            rows = cur.fetchall() or []
        return [self._to_thread(row) for row in rows]

    def touch(self, thread_id: int, title: str | None = None) -> None:
        with cursor() as (cur, conn):
            if title:
                cur.execute(
                    "UPDATE threads SET last_updated = %s, thread_title = %s WHERE id = %s",
                    (datetime.now(), title, thread_id),
                )
            else:
                cur.execute("UPDATE threads SET last_updated = %s WHERE id = %s", (datetime.now(), thread_id))
            conn.commit()

    def delete(self, thread_id: int) -> None:
        with cursor() as (cur, conn):
            cur.execute("DELETE FROM threads WHERE id = %s", (thread_id,))
            conn.commit()

    def _to_thread(self, row: dict) -> Thread:
        return Thread(
            id=int(row["id"]),
            user_id=int(row["user_id"]),
            title=row.get("thread_title"),
            last_updated=row.get("last_updated"),
        )

import json

from domain.conversation.models import ChatReference, ChatTurn
from infrastructure.db.connection import cursor


class PostgresChatTurnRepository:
    def append(self, turn: ChatTurn) -> ChatTurn:
        refs_json = json.dumps([ref.to_dict() for ref in turn.refs], ensure_ascii=False)
        with cursor() as (cur, conn):
            cur.execute(
                """
                INSERT INTO thread_qa (thread_id, question, answer, rag_qa, type)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, thread_id, question, answer, rag_qa, type, created_at
                """,
                (turn.thread_id, turn.user_message, turn.assistant_message, refs_json, turn.type),
            )
            row = cur.fetchone()
            conn.commit()
        return self._to_turn(row)

    def list_by_thread(self, thread_id: int) -> list[ChatTurn]:
        with cursor() as (cur, _conn):
            cur.execute(
                """
                SELECT id, thread_id, question, answer, rag_qa, COALESCE(type, '') AS type, created_at
                FROM thread_qa
                WHERE thread_id = %s
                ORDER BY created_at ASC
                """,
                (thread_id,),
            )
            rows = cur.fetchall() or []
        return [self._to_turn(row) for row in rows]

    def list_recent_by_thread(self, thread_id: int, limit: int) -> list[ChatTurn]:
        with cursor() as (cur, _conn):
            cur.execute(
                """
                SELECT id, thread_id, question, answer, rag_qa, COALESCE(type, '') AS type, created_at
                FROM thread_qa
                WHERE thread_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (thread_id, limit),
            )
            rows = cur.fetchall() or []
        return [self._to_turn(row) for row in reversed(rows)]

    def delete_by_thread(self, thread_id: int) -> None:
        with cursor() as (cur, conn):
            cur.execute("DELETE FROM thread_qa WHERE thread_id = %s", (thread_id,))
            conn.commit()

    def _to_turn(self, row: dict) -> ChatTurn:
        raw_refs = row.get("rag_qa") or "[]"
        if isinstance(raw_refs, str):
            try:
                parsed_refs = json.loads(raw_refs)
            except json.JSONDecodeError:
                parsed_refs = []
        else:
            parsed_refs = raw_refs
        refs = [ChatReference.from_dict(item) for item in parsed_refs if isinstance(item, dict)]
        return ChatTurn(
            id=int(row["id"]),
            thread_id=int(row["thread_id"]),
            user_message=row["question"],
            assistant_message=row["answer"],
            refs=refs,
            type=row.get("type") or "",
            created_at=row.get("created_at"),
        )

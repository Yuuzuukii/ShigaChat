from __future__ import annotations

import json
from typing import Any

from database_utils import get_db_cursor, get_placeholder


def load_thread_history(thread_id: int, k: int = 6) -> list[dict[str, Any]]:
    """Load the most recent thread history, oldest to newest, including parsed references."""
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(
            f"""
            SELECT question, answer, rag_qa
            FROM thread_qa
            WHERE thread_id = {ph}
            ORDER BY created_at DESC
            LIMIT {k}
            """,
            (thread_id,),
        )
        rows = cursor.fetchall() or []

    history: list[dict[str, Any]] = []
    for row in reversed(rows):
        rag_qa: list[dict[str, Any]] = []
        raw_rag_qa = row.get("rag_qa")
        if raw_rag_qa:
            try:
                parsed = json.loads(raw_rag_qa)
                if isinstance(parsed, list):
                    rag_qa = parsed
            except (json.JSONDecodeError, TypeError):
                rag_qa = []
        history.append(
            {
                "question": row.get("question"),
                "answer": row.get("answer"),
                "rag_qa": rag_qa,
            }
        )
    return history


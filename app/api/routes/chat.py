import sqlite3
from datetime import datetime
from typing import List, Tuple, Optional

from fastapi import APIRouter, HTTPException, Depends

from config import DATABASE
from models.schemas import Question
from api.routes.user import current_user_info
from api.routes.question import get_answer as backend_get_answer
from api.utils.reactive import (
    classify_intent,
    resolve_target_text,
    _detect_target_lang,
    translate_text,
    summarize_text,
    rewrite_text,
)

router = APIRouter()


def _ensure_thread_qa_has_rag_column(conn: sqlite3.Connection) -> None:
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(thread_qa)")
        cols = [row[1] for row in cur.fetchall()]
        if "rag_qa" not in cols:
            cur.execute("ALTER TABLE thread_qa ADD COLUMN rag_qa TEXT")
            conn.commit()
    except Exception:
        pass


def _get_last_5_history(thread_id: int) -> List[Tuple[str, str]]:
    with sqlite3.connect(DATABASE) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT question, answer FROM thread_qa
            WHERE thread_id = ?
            ORDER BY created_at DESC
            LIMIT 5
            """,
            (thread_id,),
        )
        rows = cur.fetchall()
    rows.reverse()  # chronological order (old -> new)
    return rows


@router.post("/respond")
async def respond(request: Question, current_user: dict = Depends(current_user_info)):
    """
    Router agent:
    - If question clearly matches a reactive task (translate/summarize/rewrite), handle locally.
    - Otherwise, delegate to backend RAG agent without modification.
    """
    question_text = request.text
    user_id = current_user["id"]
    user_lang = current_user.get("spoken_language", "ja")

    # Thread handling (align with question.get_answer)
    with sqlite3.connect(DATABASE) as conn:
        cur = conn.cursor()
        assigned_thread_id: Optional[int] = None

        if request.thread_id is not None:
            cur.execute("SELECT id, user_id FROM threads WHERE id = ?", (request.thread_id,))
            row = cur.fetchone()
            if row:
                if row[1] != user_id:
                    raise HTTPException(status_code=403, detail="このスレッドにアクセスする権限がありません")
                assigned_thread_id = request.thread_id

        if assigned_thread_id is None:
            cur.execute(
                "INSERT INTO threads (user_id, last_updated) VALUES (?, ?)",
                (user_id, datetime.now()),
            )
            assigned_thread_id = cur.lastrowid
            conn.commit()

    # Load last 5 turns for routing
    history_qa = _get_last_5_history(assigned_thread_id)

    # Intent classification (conservative)
    intent = classify_intent(question_text)
    if intent is None:
        # Delegate to backend (RAG)
        backend_result = await backend_get_answer(
            Question(thread_id=assigned_thread_id, text=question_text),
            current_user,
        )
        # Ensure no modification of backend answer
        backend_result.update({"route": "backend", "reason": "default_to_backend"})
        return backend_result

    # Reactive task path
    task_type = intent["type"]
    target_text = resolve_target_text(question_text, history_qa)
    if not target_text:
        # Not enough info to run reactive task → delegate to backend
        backend_result = await backend_get_answer(
            Question(thread_id=assigned_thread_id, text=question_text),
            current_user,
        )
        backend_result.update({"route": "backend", "reason": "insufficient_reactive_context"})
        return backend_result

    # Decide target/output language (for translate/summarize/rewrite)
    # Default to user's spoken language when unspecified.
    target_lang_code = _detect_target_lang(question_text, fallback=user_lang.lower())

    try:
        if task_type == "translate":
            answer_text = translate_text(target_text, target_lang_code)
        elif task_type == "summarize":
            answer_text = summarize_text(target_text, target_lang_code)
        else:  # rewrite
            answer_text = rewrite_text(target_text, target_lang_code)
    except Exception as e:
        # On LLM error, fallback to backend
        backend_result = await backend_get_answer(
            Question(thread_id=assigned_thread_id, text=question_text),
            current_user,
        )
        backend_result.update({"route": "backend", "reason": f"reactive_error:{str(e)}"})
        return backend_result

    # Persist this QA into thread_qa (rag_qa is None)
    with sqlite3.connect(DATABASE) as conn:
        _ensure_thread_qa_has_rag_column(conn)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO thread_qa (thread_id, question, answer, rag_qa)
            VALUES (?, ?, ?, ?)
            """,
            (assigned_thread_id, question_text, answer_text, None),
        )
        cur.execute(
            "UPDATE threads SET last_updated = ? WHERE id = ?",
            (datetime.now(), assigned_thread_id),
        )
        conn.commit()

    return {
        "route": "frontend",
        "thread_id": assigned_thread_id,
        "question": question_text,
        "answer": answer_text,
        "reason": f"reactive:{task_type}",
        "task_type": task_type,
    }


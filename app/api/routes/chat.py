from datetime import datetime
from typing import List, Tuple, Optional

from fastapi import APIRouter, HTTPException, Depends

from database_utils import get_db_cursor, get_placeholder
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


def _get_last_5_history(thread_id: int) -> List[Tuple[str, str]]:
    """過去5件の会話履歴を取得"""
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(
            f"""
            SELECT question, answer FROM thread_qa
            WHERE thread_id = {ph}
            ORDER BY created_at DESC
            LIMIT 5
            """,
            (thread_id,),
        )
        rows = cursor.fetchall()
    
    result = [(row['question'], row['answer']) for row in rows]
    
    result.reverse()  # chronological order (old -> new)
    return result


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
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        assigned_thread_id: Optional[int] = None

        if request.thread_id is not None:
            cursor.execute(f"SELECT id, user_id FROM threads WHERE id = {ph}", (request.thread_id,))
            row = cursor.fetchone()
            if row:
                row_user_id = row['user_id']
                   
                if row_user_id != user_id:
                    raise HTTPException(status_code=403, detail="このスレッドにアクセスする権限がありません")
                assigned_thread_id = request.thread_id

        if assigned_thread_id is None:
            cursor.execute(
                f"INSERT INTO threads (user_id, last_updated) VALUES ({ph}, {ph})",
                (user_id, datetime.now()),
            )
            assigned_thread_id = cursor.lastrowid
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
    
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(
            f"""
            INSERT INTO thread_qa (thread_id, question, answer, rag_qa)
            VALUES ({ph}, {ph}, {ph}, {ph})
            """,
            (assigned_thread_id, question_text, answer_text, None),
        )
        cursor.execute(
            f"UPDATE threads SET last_updated = {ph} WHERE id = {ph}",
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


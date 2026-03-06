"""
pgvector版のRAGオーケストレータ。
MySQLで管理しているthread履歴を取り出し、pgvector検索→プロンプト→LLM生成までを一括で行う。
"""

from __future__ import annotations

import json
from typing import List, Tuple, Dict, Any, Optional

from database_utils import get_db_cursor, get_placeholder
from api.rag.detect import detect_language
from api.rag.search import retrieve
from api.rag.prompt_builder import build_prompt
from api.rag.generator import generate_answer, strip_citations


# thread_id から直近k件の会話履歴を取得
def load_history(thread_id: int, k: int = 6) -> List[Tuple[str, str]]:
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(
            f"""
            SELECT question, answer
            FROM thread_qa
            WHERE thread_id = {ph}
            ORDER BY created_at DESC
            LIMIT {k}
            """,
            (thread_id,),
        )
        rows = cursor.fetchall() or []
    history = [(r["question"], r["answer"]) for r in reversed(rows)]
    return history


def load_summary(thread_id: int) -> Optional[str]:
    """スレッドのローリング要約を取得。未作成またはカラム未存在時は None。"""
    ph = get_placeholder()
    try:
        with get_db_cursor() as (cursor, conn):
            cursor.execute(
                f"SELECT summary FROM threads WHERE id = {ph}",
                (thread_id,),
            )
            row = cursor.fetchone()
        if row and row.get("summary"):
            return row["summary"]
    except Exception:
        pass
    return None


def answer_with_rag_pg(
    question_text: str,
    thread_id: int | None,
    *,
    similarity_threshold: float = 0.3,
    top_k: int = 5,
    force_lang: str | None = None,
) -> Dict[str, Any]:
    """
    pgvector検索→プロンプト→LLM までをまとめた1ステップ関数。
    thread_id があれば履歴を取得し、lang判定は質問文から行う。
    force_lang を指定すると、言語検出を無視してその言語を使用する。
    """
    if force_lang:
        iso = force_lang
        # 日本語の場合は language_id = 1 を使用
        language_id = 1 if force_lang == "ja" else None
    else:
        iso, language_id = detect_language(question_text)
    history_qa = load_history(thread_id, k=6) if thread_id else []
    summary = load_summary(thread_id) if thread_id else None

    contexts = retrieve(
        query=question_text,
        language_id=language_id,
        top_k=top_k,
        similarity_threshold=similarity_threshold,
    )

    # sid 付きでプロンプト用に整形
    ctx_list = []
    for i, c in enumerate(contexts, 1):
        ctx_list.append(
            {
                "sid": f"S{i}",
                "qa_id": c.qa_id,
                "category_id": c.category_id,
                "question": c.question_text,
                "answer": c.answer_text,
            }
        )

    prompt = build_prompt(question_text, ctx_list, lang=iso, summary=summary)
    answer_text, model_used = generate_answer(prompt)
    clean_text = strip_citations(answer_text)

    # LLMがJSON形式で返した場合、answerフィールドを抽出
    used_source_ids = []
    try:
        parsed = json.loads(clean_text)
        if isinstance(parsed, dict) and "answer" in parsed:
            used_source_ids = parsed.get("used_source_ids", [])
            clean_text = parsed["answer"]
    except (json.JSONDecodeError, TypeError):
        pass

    return {
        "type": "rag",
        "text": clean_text,
        "meta": {
            "lang": iso,
            "language_id": language_id,
            "references": ctx_list,
            "used_source_ids": used_source_ids,
            "similarity_threshold": similarity_threshold,
            "model_used": model_used,
            "history_used": len(history_qa),
            "summary_used": summary is not None,
        },
    }


__all__ = ["answer_with_rag_pg", "load_history"]

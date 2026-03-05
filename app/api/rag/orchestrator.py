"""
pgvector版のRAGオーケストレータ。
MySQLで管理しているthread履歴を取り出し、pgvector検索→プロンプト→LLM生成までを一括で行う。
"""

from __future__ import annotations

import json
from typing import List, Dict, Any, Optional

from database_utils import get_db_cursor, get_placeholder
from api.rag.detect import detect_language
from api.rag.search import retrieve
from api.rag.prompt_builder import build_prompt
from api.rag.generator import generate_answer, strip_citations


# thread_id から直近k件の会話履歴を取得（rag_qa を含む）
def load_history(thread_id: int, k: int = 6) -> List[Dict[str, Any]]:
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
    history: List[Dict[str, Any]] = []
    for r in reversed(rows):
        rag_qa = []
        raw_rag_qa = r.get("rag_qa")
        if raw_rag_qa:
            try:
                parsed = json.loads(raw_rag_qa)
                if isinstance(parsed, list):
                    rag_qa = parsed
            except (json.JSONDecodeError, TypeError):
                rag_qa = []
        history.append(
            {
                "question": r.get("question"),
                "answer": r.get("answer"),
                "rag_qa": rag_qa,
            }
        )
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
    user_spoken_language: str | None = None,
) -> Dict[str, Any]:
    """
    pgvector検索→プロンプト→LLM までをまとめた1ステップ関数。
    thread_id があれば履歴を取得し、lang判定は質問文から行う。

    プロンプト言語は user_spoken_language を優先し、なければ質問文から自動検出。
    """
    iso, language_id = detect_language(question_text)
    history_qa = load_history(thread_id, k=6) if thread_id else []
    recent_history_qa = history_qa[-3:] if history_qa else []
    # summary = load_summary(thread_id) if thread_id else None  # 会話要約は一旦無効化
    summary = None

    # プロンプト言語の決定: user設定を優先
    prompt_lang = iso  # デフォルトは質問文の言語
    if user_spoken_language:
        # spoken_languageの値を正規化（例: "Japanese" / "日本語" → "ja"）
        lang_map = {
            # English names
            "japanese": "ja", "english": "en", "vietnamese": "vi",
            "chinese": "zh", "korean": "ko", "portuguese": "pt",
            "spanish": "es", "tagalog": "tl", "indonesian": "id",
            # ISO codes
            "ja": "ja", "en": "en", "vi": "vi", "zh": "zh",
            "ko": "ko", "pt": "pt", "es": "es", "tl": "tl", "id": "id",
            # Native language names (matching DB values)
            "日本語": "ja", "英語": "en", "ベトナム語": "vi",
            "中国語": "zh", "韓国語": "ko", "ポルトガル語": "pt",
            "スペイン語": "es", "タガログ語": "tl", "インドネシア語": "id",
        }
        normalized = user_spoken_language.lower().strip()
        if normalized in lang_map:
            prompt_lang = lang_map[normalized]

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
                "question": c.question_text,
                "answer": c.answer_text,
            }
        )

    prompt = build_prompt(
        question_text,
        ctx_list,
        lang=prompt_lang,
        summary=summary,
        history_qa=recent_history_qa,
    )
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
            "prompt_lang": prompt_lang,
            "language_id": language_id,
            "references": ctx_list,
            "used_source_ids": used_source_ids,
            "similarity_threshold": similarity_threshold,
            "model_used": model_used,
            "history_used": len(recent_history_qa),
            "summary_used": summary is not None,
        },
    }


__all__ = ["answer_with_rag_pg", "load_history"]

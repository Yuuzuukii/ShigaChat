"""
Vector search (pgvector) for QA embeddings stored in PostgreSQL.

Workflow:
- embed query text
- cosine distance search via `<=>` (vector_cosine_ops)
- fetch translations to return question/answer text
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import List, Optional, Tuple

import numpy as np
from openai import OpenAI

from api.rag.vector_store import _get_conn, EMBEDDING_MODEL, EMBEDDING_DIM

@lru_cache(maxsize=1)
def _get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=api_key)


@dataclass
class SearchResult:
    qa_id: int
    question_id: int
    answer_id: int
    language_id: int
    similarity: float
    question_text: str
    answer_text: str
    category_id: Optional[int]
    question_ts: Optional[str]
    answer_ts: Optional[str]


# クエリ文字列を埋め込みベクトルに変換する
def embed_query(text: str) -> np.ndarray:
    """Embed query text using the same model as vector_store."""
    try:
        resp = _get_openai_client().embeddings.create(input=[text], model=EMBEDDING_MODEL)
    except Exception as e:
        raise RuntimeError(f"Failed to embed query: {e}") from e
    return np.array(resp.data[0].embedding, dtype="float32")


# pgvectorでコサイン距離検索を行い、類似度が閾値以上の結果を返す
def retrieve(
    query: str,
    language_id: int,
    top_k: int = 5,
    similarity_threshold: float = 0.3,
) -> List[SearchResult]:
    vec = embed_query(query)

    sql = """
    SELECT qa_id, question_id, answer_id, language_id,
           category_id, question_ts, answer_ts,
           (embedding <=> %s) AS distance
    FROM qa_embedding
    WHERE language_id = %s
    ORDER BY embedding <=> %s
    LIMIT %s;
    """

    results: List[SearchResult] = []
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (vec, language_id, vec, top_k))
            rows = cur.fetchall() or []

    if not rows:
        return []

    # Collect question/answer texts for returned rows
    with _get_conn() as conn:
        with conn.cursor() as cur:
            for row in rows:
                distance = float(row["distance"])
                similarity = 1.0 - distance
                if similarity < similarity_threshold:
                    continue

                qid = row["question_id"]
                aid = row["answer_id"]

                cur.execute(
                    "SELECT texts FROM question_translation WHERE question_id = %s AND language_id = %s",
                    (qid, language_id),
                )
                qrow = cur.fetchone()
                cur.execute(
                    "SELECT texts FROM answer_translation WHERE answer_id = %s AND language_id = %s",
                    (aid, language_id),
                )
                arow = cur.fetchone()

                question_text = qrow["texts"] if qrow else ""
                answer_text = arow["texts"] if arow else ""

                results.append(
                    SearchResult(
                        qa_id=row["qa_id"],
                        question_id=qid,
                        answer_id=aid,
                        language_id=row["language_id"],
                        similarity=similarity,
                        question_text=question_text,
                        answer_text=answer_text,
                        category_id=row.get("category_id"),
                        question_ts=row.get("question_ts"),
                        answer_ts=row.get("answer_ts"),
                    )
                )
    return results


__all__ = ["SearchResult", "embed_query", "retrieve"]

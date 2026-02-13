"""
PostgreSQL (pgvector) backend for storing QA embeddings.

Responsibilities in this initial cut:
- connect to Postgres using env vars (PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE)
- ensure extension/table/index exist
- generate embedding from question+answer payload
- save/upsert into qa_embedding

Notes:
- Requires `psycopg[binary]` (psycopg v3) and `pgvector` extension on the DB.
- Uses OpenAI text-embedding-3-small (1536 dims). Override with EMBEDDING_MODEL / EMBEDDING_DIM env vars.
"""

from __future__ import annotations

import os
import datetime as dt
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import numpy as np
from openai import OpenAI

try:
    import psycopg
    from psycopg.rows import dict_row
    from pgvector.psycopg import register_vector
except ImportError as e:  # pragma: no cover - dependency missing at dev time
    raise ImportError(
        "psycopg (v3) and pgvector are required for PostgreSQL vector storage. "
        "Install with: pip install 'psycopg[binary]' pgvector"
    ) from e


EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))

def _get_pg_config():
    """接続時に環境変数を評価する（モジュール読み込み時ではなく）"""
    return {
        "host": os.getenv("PG_HOST"),
        "port": int(os.getenv("PG_PORT", "5432")),
        "user": os.getenv("PG_USER"),
        "password": os.getenv("PG_PASSWORD"),
        "dbname": os.getenv("PG_DATABASE"),
    }

@lru_cache(maxsize=1)
def _get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=api_key)


@dataclass
class EmbeddingRecord:
    qa_id: int
    question_id: int
    language_id: int
    embedding: np.ndarray  # 1D float32
    category_id: Optional[int] = None
    question_ts: Optional[dt.datetime] = None
    answer_ts: Optional[dt.datetime] = None


# PostgreSQLへの接続を取得し、pgvectorの型を登録する
def _get_conn():
    dsn = os.getenv("PG_DSN")
    if dsn:
        conn = psycopg.connect(dsn, row_factory=dict_row)
    else:
        conn = psycopg.connect(**_get_pg_config(), row_factory=dict_row)
    register_vector(conn)
    return conn


# 関数の説明
# def fetch_qa_payload_from_postgres
def fetch_qa_payload_from_postgres(
    question_id: int,
    answer_id: int,
    language_id: int,
) -> dict:
    """
    Postgres上の translation/QA テーブルからテキストとメタ情報を取得する。
    language_id を直接指定する前提。
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM language WHERE id = %s LIMIT 1", (language_id,))
            lang_row = cur.fetchone()
            if not lang_row:
                raise ValueError(f"language id not found: {language_id}")

            cur.execute(
                "SELECT texts FROM question_translation WHERE question_id = %s AND language_id = %s",
                (question_id, language_id),
            )
            qrow = cur.fetchone()
            cur.execute(
                "SELECT texts FROM answer_translation WHERE answer_id = %s AND language_id = %s",
                (answer_id, language_id),
            )
            arow = cur.fetchone()
            if not (qrow and arow):
                raise ValueError("translation not found for given question/answer/lang")

            cur.execute(
                "SELECT id, answer_id FROM QA WHERE question_id = %s AND answer_id = %s LIMIT 1",
                (question_id, answer_id),
            )
            qarow = cur.fetchone()
            if not qarow:
                raise ValueError("QA pair not found")

            cur.execute("SELECT category_id, time FROM question WHERE question_id = %s", (question_id,))
            qmeta = cur.fetchone() or {}
            cur.execute("SELECT time FROM answer WHERE id = %s", (answer_id,))
            ameta = cur.fetchone() or {}

            return {
                "qa_id": qarow["id"],
                "answer_id": qarow["answer_id"],
                "language_id": language_id,
                "question_text": qrow["texts"],
                "answer_text": arow["texts"],
                "category_id": qmeta.get("category_id"),
                "question_ts": qmeta.get("time"),
                "answer_ts": ameta.get("time"),
            }


# pgvector拡張機能、qa_embeddingテーブル、インデックスが存在しない場合に作成する
def ensure_schema(dim: int = EMBEDDING_DIM) -> None:
    ddl_table = f"""
    CREATE TABLE IF NOT EXISTS qa_embedding (
        id BIGSERIAL PRIMARY KEY,
        qa_id BIGINT NOT NULL,
        question_id BIGINT NOT NULL,
        answer_id BIGINT NOT NULL,
        language_id INT NOT NULL,
        embedding vector({dim}) NOT NULL,
        category_id BIGINT,
        question_ts TIMESTAMPTZ,
        answer_ts TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (qa_id, language_id)
    );
    """
    ddl_idx_lang = "CREATE INDEX IF NOT EXISTS idx_qa_embedding_language ON qa_embedding(language_id);"
    ddl_idx_cat = "CREATE INDEX IF NOT EXISTS idx_qa_embedding_category ON qa_embedding(category_id);"
    ddl_idx_vec = "CREATE INDEX IF NOT EXISTS idx_qa_embedding_vec_hnsw ON qa_embedding USING hnsw (embedding vector_cosine_ops);"

    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute(ddl_table)
            cur.execute(ddl_idx_lang)
            cur.execute(ddl_idx_cat)
            conn.commit()  # persist basic objects first

            # HNSW may fail if pgvector < 0.6; swallow errors to stay bootable.
            try:
                cur.execute(ddl_idx_vec)
                conn.commit()
            except Exception:
                conn.rollback()

# OpenAI APIを使ってembeddingベクトルを生成する
def embed_payload(question_text: str, answer_text: str) -> np.ndarray:
    payload = f"Q: {question_text}\nA: {answer_text}"
    try:
        resp = _get_openai_client().embeddings.create(input=[payload], model=EMBEDDING_MODEL)
    except Exception as e:
        raise RuntimeError(f"Failed to create embedding: {e}") from e
    return np.array(resp.data[0].embedding, dtype="float32")


# Q&Aテキストからembeddingを生成し、PostgreSQLにupsert（挿入または更新）する
def upsert_embedding(
    question_text: str,
    answer_text: str,
    *,
    qa_id: int,
    question_id: int,
    answer_id: int,
    language_id: int,
    category_id: Optional[int] = None,
    question_ts: Optional[dt.datetime] = None,
    answer_ts: Optional[dt.datetime] = None,
) -> int:

    ensure_schema(EMBEDDING_DIM)
    vec = embed_payload(question_text, answer_text)

    # Debug: show which record is being upserted
    print(f"[UPSERT] qa_id={qa_id} qid={question_id} aid={answer_id} lang_id={language_id}")

    sql = """
    INSERT INTO qa_embedding
        (qa_id, question_id, answer_id, language_id, embedding, category_id, question_ts, answer_ts, updated_at)
    VALUES
        (%(qa_id)s, %(question_id)s, %(answer_id)s, %(language_id)s, %(embedding)s,
         %(category_id)s, %(question_ts)s, %(answer_ts)s, NOW())
    ON CONFLICT (qa_id, language_id) DO UPDATE SET
        question_id = EXCLUDED.question_id,
        answer_id = EXCLUDED.answer_id,
        language_id = EXCLUDED.language_id,
        embedding = EXCLUDED.embedding,
        category_id = EXCLUDED.category_id,
        question_ts = EXCLUDED.question_ts,
        answer_ts = EXCLUDED.answer_ts,
        updated_at = NOW();
    """
    params = {
        "qa_id": qa_id,
        "question_id": question_id,
        "answer_id": answer_id,
        "language_id": language_id,
        "embedding": vec,
        "category_id": category_id,
        "question_ts": question_ts,
        "answer_ts": answer_ts,
    }

    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()
        return cur.rowcount


# Postgresの翻訳テーブルからテキストを読み取り、pgvectorテーブルにUPSERTする。
def upsert_embedding_from_postgres(
    question_id: int,
    answer_id: int,
    language_id: int,
) -> int:
    data = fetch_qa_payload_from_postgres(question_id, answer_id, language_id)
    return upsert_embedding(
        question_text=data["question_text"],
        answer_text=data["answer_text"],
        qa_id=data["qa_id"],
        question_id=question_id,
        answer_id=answer_id,
        language_id=language_id,
        category_id=data["category_id"],
        question_ts=data["question_ts"],
        answer_ts=data["answer_ts"],
    )


# Postgres内の全QA×全言語を走査し、翻訳がそろっているものをベクトル化してqa_embeddingへUPSERTする。
def bulk_sync_all() -> dict:
    ensure_schema(EMBEDDING_DIM)

    stats = {"processed": 0, "skipped": 0, "errors": 0}

    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM language")
            languages = cur.fetchall() or []

            cur.execute("SELECT id, question_id, answer_id FROM QA")
            qa_rows = cur.fetchall() or []

    # 外側で1コネクションに拘らない（embedはAPI呼び出しがあるため分離）
    for qa in qa_rows:
        qid = qa["question_id"]
        aid = qa["answer_id"]
        for lang in languages:
            lang_id = lang["id"]
            try:
                print(f"[SYNC] qid={qid} aid={aid} lang_id={lang_id}")
                upsert_embedding_from_postgres(qid, aid, lang_id)
                stats["processed"] += 1
            except ValueError as ve:
                # 翻訳やQA紐付けが欠けている場合はスキップ
                print(f"[SKIP] qid={qid} aid={aid} lang_id={lang_id} reason={ve}")
                stats["skipped"] += 1
            except Exception as e:
                print(f"[ERROR] qid={qid} aid={aid} lang_id={lang_id} error={e}")
                stats["errors"] += 1
    return stats

__all__ = [
    "EmbeddingRecord",
    "ensure_schema",
    "embed_payload",
    "upsert_embedding",
    "fetch_qa_payload_from_postgres",
    "upsert_embedding_from_postgres",
    "bulk_sync_all",
]

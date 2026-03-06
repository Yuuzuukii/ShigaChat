#!/usr/bin/env python3
"""
Scrape SIA Q&A pages, inject into PostgreSQL, and upsert pgvector embeddings.

Flow:
1) Backup current DB via scripts/dump_postgres.sh into backup/ with timestamp
2) Wipe seed target tables (QA/translation/vector related)
3) Scrape 9-language Q&A pages from s-i-a.or.jp
4) Insert question/answer/QA + translations
5) Generate embeddings and upsert into shigachat.qa_embedding
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import psycopg
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
import requests


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_BACKUP_DIR = PROJECT_ROOT / "backup"
DEFAULT_DUMP_SCRIPT = SCRIPT_DIR / "dump_postgres.sh"

BASE = "https://www.s-i-a.or.jp"
DEFAULT_FIXED_DT = datetime.now().strftime("%Y-%m-%d %H:%M:%S+09")
DEFAULT_SLEEP_SEC = 0.7
USER_AGENT = {"User-Agent": "ShigaChatCrawler/1.0 (+https://example.com)"}

# Website path uses zh-cn while DB language code is zh (id=4).
LANGS: List[Tuple[str, int, str]] = [
    ("ja", 1, ""),
    ("en", 2, "/en"),
    ("vi", 3, "/vi"),
    ("zh", 4, "/zh-cn"),
    ("ko", 5, "/ko"),
    ("pt", 6, "/pt"),
    ("es", 7, "/es"),
    ("tl", 8, "/tl"),
    ("id", 9, "/id"),
]

CATEGORY_SLUGS = {
    1: "immigration_residency_procedures",
    2: "daily_living",
    3: "medical_care",
    4: "pension_insurance",
    5: "labor",
    6: "education",
    7: "marriage_divorce",
    8: "childbirth_childcare",
    9: "housing",
    10: "tax",
    11: "welfare",
    12: "incidents_accidents",
    13: "disaster",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape SIA QA pages and inject data + embeddings into PostgreSQL."
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=DEFAULT_BACKUP_DIR,
        help="Directory for pre-run SQL backups.",
    )
    parser.add_argument(
        "--dump-script",
        type=Path,
        default=DEFAULT_DUMP_SCRIPT,
        help="Path to dump_postgres.sh script.",
    )
    parser.add_argument(
        "--skip-backup",
        action="store_true",
        help="Skip DB backup step.",
    )
    parser.add_argument(
        "--skip-vector",
        action="store_true",
        help="Skip embedding generation and qa_embedding upsert.",
    )
    parser.add_argument(
        "--sleep-sec",
        type=float,
        default=DEFAULT_SLEEP_SEC,
        help="Delay between page requests.",
    )
    parser.add_argument(
        "--fixed-datetime",
        type=str,
        default=DEFAULT_FIXED_DT,
        help="Timestamp inserted into question.time / answer.time / edited fields.",
    )
    return parser.parse_args()


def run_backup(dump_script: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"shigachat_pre_scrape_inject_{ts}.sql"

    print(f"[backup] creating dump at: {backup_path}")

    env = os.environ.copy()
    env["PGPASSWORD"] = _required_env("PG_PASSWORD")

    with open(backup_path, "w") as f:
        subprocess.run(
            [
                "pg_dump",
                "-h", _required_env("PG_HOST"),
                "-p", os.getenv("PG_PORT", "5432"),
                "-U", _required_env("PG_USER"),
                "-d", _required_env("PG_DATABASE"),
                "--no-owner",
                "--no-privileges",
                "--clean",
                "--if-exists",
            ],
            stdout=f,
            env=env,
            check=True,
        )

    size = backup_path.stat().st_size // 1024
    print(f"[backup] done: {backup_path} ({size} KB)")
    return backup_path


def html_to_plaintext(html: str) -> str:
    if not html:
        return ""

    soup = BeautifulSoup(html, "html.parser")
    for bad in soup(["script", "style"]):
        bad.decompose()

    for a in soup.find_all("a"):
        txt = a.get_text(" ", strip=True)
        href = (a.get("href") or "").strip()
        a.replace_with(f"{txt} ({href})" if href else txt)

    for dl in soup.find_all("dl"):
        lines, term = [], None
        for child in dl.children:
            name = getattr(child, "name", None)
            if name == "dt":
                term = child.get_text(" ", strip=True)
            elif name == "dd":
                desc = child.get_text(" ", strip=True)
                if term:
                    lines.append(f"{term}: {desc}")
                    term = None
        dl.replace_with("\n".join(lines))

    for lst in soup.find_all(["ol", "ul"]):
        items = []
        for i, li in enumerate(lst.find_all("li", recursive=False), start=1):
            txt = li.get_text(" ", strip=True)
            if txt:
                items.append(f"{i}. {txt}" if lst.name == "ol" else f"- {txt}")
        lst.replace_with("\n".join(items))

    for h in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        txt = h.get_text(" ", strip=True)
        h.replace_with(txt + "\n")

    for br in soup.find_all("br"):
        br.replace_with("\n")
    for p in soup.find_all("p"):
        p.replace_with(p.get_text(" ", strip=True) + "\n")

    text = soup.get_text("\n", strip=True)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def fetch_pairs(url: str) -> List[Tuple[str, str]]:
    resp = requests.get(url, headers=USER_AGENT, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    pairs: List[Tuple[str, str]] = []
    for blk in soup.select(".paragraph--type--consulting-qa"):
        q = blk.select_one(".field--name-field-question .field__item")
        a = blk.select_one(".field--name-field-answer .field__item")
        if not (q and a):
            continue

        answer_html = a.decode_contents()

        # 関連ページリンク (.field--name-field-qanda-link) を回答末尾に追記
        link_field = blk.select_one(".field--name-field-qanda-link")
        if link_field:
            link_items = []
            for item in link_field.select(".field__item a"):
                href = str(item.get("href") or "").strip()
                label = item.get_text(" ", strip=True)
                if href:
                    link_items.append(f'<a href="{href}">{label}</a>')
            if link_items:
                links_html = "<p>関連ページ: " + " / ".join(link_items) + "</p>"
                answer_html = answer_html + links_html

        pairs.append((q.get_text(" ", strip=True), answer_html))
    return pairs


def load_category_all_lang(slug: str, sleep_sec: float) -> Dict[int, List[Tuple[str, str]]]:
    result: Dict[int, List[Tuple[str, str]]] = {}
    for code, lang_id, prefix in LANGS:
        url = f"{BASE}{prefix}/qa/{slug}" if code != "ja" else f"{BASE}/qa/{slug}"
        print(f"[scrape] GET {url}")
        try:
            result[lang_id] = fetch_pairs(url)
        except Exception as exc:
            print(f"[scrape] WARN lang={code} slug={slug} error={exc}")
            result[lang_id] = []
        time.sleep(sleep_sec)
    return result


def _required_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(f"missing required env var: {name}")
    return val


def get_conn() -> psycopg.Connection:
    conn = psycopg.connect(
        host=_required_env("PG_HOST"),
        port=int(os.getenv("PG_PORT", "5432")),
        user=_required_env("PG_USER"),
        password=_required_env("PG_PASSWORD"),
        dbname=_required_env("PG_DATABASE"),
        autocommit=False,
        row_factory=dict_row,
    )
    register_vector(conn)
    return conn


def ensure_language_ids(cur: psycopg.Cursor) -> None:
    cur.execute("SELECT id FROM shigachat.language ORDER BY id")
    ids = {int(r["id"]) for r in cur.fetchall()}
    required = {lang_id for _, lang_id, _ in LANGS}
    missing = sorted(required - ids)
    if missing:
        raise RuntimeError(f"missing language ids in shigachat.language: {missing}")


def table_exists(cur: psycopg.Cursor, schema: str, table: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = %s AND table_name = %s
        LIMIT 1
        """,
        (schema, table),
    )
    return cur.fetchone() is not None


def wipe_seed_tables(cur: psycopg.Cursor) -> None:
    # qa_embedding has no FK, so clean it first to avoid stale vectors.
    cur.execute("DELETE FROM shigachat.qa_embedding")

    # question_grammar_check exists in multiple schemas in this project.
    if table_exists(cur, "public", "question_grammar_check"):
        cur.execute("DELETE FROM public.question_grammar_check")
    if table_exists(cur, "shigachat", "question_grammar_check"):
        cur.execute("DELETE FROM shigachat.question_grammar_check")

    cur.execute("DELETE FROM shigachat.question_translation")
    cur.execute("DELETE FROM shigachat.answer_translation")
    cur.execute("DELETE FROM shigachat.qa")
    cur.execute("DELETE FROM shigachat.question")
    cur.execute("DELETE FROM shigachat.answer")


def ensure_seed_user(cur: psycopg.Cursor) -> int:
    cur.execute("SELECT id FROM shigachat.\"user\" WHERE name = %s LIMIT 1", ("sia",))
    row = cur.fetchone()
    if row:
        return int(row["id"])

    cur.execute(
        "INSERT INTO shigachat.\"user\" (name, password) VALUES (%s, %s) RETURNING id",
        ("sia", "sia"),
    )
    return int(cur.fetchone()["id"])


def short_title(text: str, limit: int = 120) -> str:
    clean = (text or "").strip()
    if not clean:
        return "Untitled"
    return clean[:limit]


# --- Embedding helper (inline; no dependency on app/api/) ---

_openai_client: "OpenAI | None" = None

def _get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = _required_env("OPENAI_API_KEY")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def _embed_payload(question_text: str, answer_text: str) -> np.ndarray:
    """OpenAI text-embedding-3-small でベクトルを生成する。"""
    model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    payload = f"Q: {question_text}\nA: {answer_text}"
    client = _get_openai_client()
    resp = client.embeddings.create(input=[payload], model=model)
    return np.array(resp.data[0].embedding, dtype="float32")


def upsert_embedding_row(
    cur: psycopg.Cursor,
    *,
    qa_id: int,
    question_id: int,
    answer_id: int,
    language_id: int,
    question_text: str,
    answer_text: str,
    category_id: int,
    question_ts: str,
    answer_ts: str,
) -> bool:
    # Keep behavior aligned with existing embedding model implementation.
    if not question_text.strip() or not answer_text.strip():
        return False

    vec = _embed_payload(question_text, answer_text)
    cur.execute(
        """
        INSERT INTO shigachat.qa_embedding
            (qa_id, question_id, answer_id, language_id, embedding, category_id, question_ts, answer_ts, updated_at)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (qa_id, language_id) DO UPDATE SET
            question_id = EXCLUDED.question_id,
            answer_id = EXCLUDED.answer_id,
            embedding = EXCLUDED.embedding,
            category_id = EXCLUDED.category_id,
            question_ts = EXCLUDED.question_ts,
            answer_ts = EXCLUDED.answer_ts,
            updated_at = NOW()
        """,
        (
            qa_id,
            question_id,
            answer_id,
            language_id,
            vec,
            category_id,
            question_ts,
            answer_ts,
        ),
    )
    return True


def main() -> int:
    args = parse_args()
    load_dotenv(PROJECT_ROOT / ".env")

    if not args.skip_backup:
        run_backup(args.dump_script, args.backup_dir)
    else:
        print("[backup] skipped")

    total_qa = 0
    total_q_trans = 0
    total_a_trans = 0
    total_vectors = 0
    skipped_vectors = 0

    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_language_ids(cur)
            print("[db] wiping existing QA/translation/vector data")
            wipe_seed_tables(cur)
            user_id = ensure_seed_user(cur)
            conn.commit()

            for category_id, slug in CATEGORY_SLUGS.items():
                print(f"[category] {category_id}: {slug}")
                by_lang = load_category_all_lang(slug, args.sleep_sec)
                base = by_lang.get(1, [])
                if not base:
                    print(f"[category] WARN no JA base data for {slug}, skipped")
                    continue

                for idx, (q_ja, _a_ja_html) in enumerate(base, start=1):
                    cur.execute(
                        """
                        INSERT INTO shigachat.question
                            (category_id, time, language_id, user_id, title, content, public)
                        VALUES
                            (%s, %s, %s, %s, %s, %s, TRUE)
                        RETURNING question_id
                        """,
                        (category_id, args.fixed_datetime, 1, user_id, short_title(q_ja), q_ja),
                    )
                    question_id = int(cur.fetchone()["question_id"])

                    cur.execute(
                        """
                        INSERT INTO shigachat.answer (time, language_id)
                        VALUES (%s, %s)
                        RETURNING id
                        """,
                        (args.fixed_datetime, 1),
                    )
                    answer_id = int(cur.fetchone()["id"])

                    cur.execute(
                        """
                        INSERT INTO shigachat.qa (question_id, answer_id)
                        VALUES (%s, %s)
                        RETURNING id
                        """,
                        (question_id, answer_id),
                    )
                    qa_id = int(cur.fetchone()["id"])
                    total_qa += 1

                    for _code, lang_id, _prefix in LANGS:
                        q_text = ""
                        a_text_plain = ""
                        pairs = by_lang.get(lang_id, [])
                        if idx - 1 < len(pairs):
                            q_text, a_html = pairs[idx - 1]
                            a_text_plain = html_to_plaintext(a_html)

                        cur.execute(
                            """
                            INSERT INTO shigachat.question_translation (question_id, language_id, texts, checked)
                            VALUES (%s, %s, %s, TRUE)
                            """,
                            (question_id, lang_id, q_text or ""),
                        )
                        total_q_trans += 1

                        cur.execute(
                            """
                            INSERT INTO shigachat.answer_translation (answer_id, language_id, texts, checked)
                            VALUES (%s, %s, %s, TRUE)
                            """,
                            (answer_id, lang_id, a_text_plain or ""),
                        )
                        total_a_trans += 1

                        if not args.skip_vector:
                            inserted = upsert_embedding_row(
                                cur,
                                qa_id=qa_id,
                                question_id=question_id,
                                answer_id=answer_id,
                                language_id=lang_id,
                                question_text=q_text or "",
                                answer_text=a_text_plain or "",
                                category_id=category_id,
                                question_ts=args.fixed_datetime,
                                answer_ts=args.fixed_datetime,
                            )
                            if inserted:
                                total_vectors += 1
                            else:
                                skipped_vectors += 1

                    if idx % 5 == 0:
                        conn.commit()
                        print(f"[category] {slug} inserted {idx}/{len(base)}")

                conn.commit()
                print(f"[category] done {slug}: {len(base)} QA")

    print("[done] scrape + inject completed")
    print(f"[done] qa={total_qa} q_trans={total_q_trans} a_trans={total_a_trans}")
    if args.skip_vector:
        print("[done] vector upsert skipped")
    else:
        print(f"[done] vectors_upserted={total_vectors} vectors_skipped_empty={skipped_vectors}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

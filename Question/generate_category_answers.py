#!/usr/bin/env python3
"""
Generate per-category answer CSV files from top 5 frequent consultation summaries.
"""

from __future__ import annotations

import csv
import glob
import json
import os
import sys
from collections import Counter
from typing import Any, Dict, List, Tuple


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
APP_DIR = os.path.join(REPO_ROOT, "app")
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)
DOCKER_APP_DIR = "/var/www"
if DOCKER_APP_DIR not in sys.path and os.path.isdir(DOCKER_APP_DIR):
    sys.path.insert(0, DOCKER_APP_DIR)

from database_utils import get_db_cursor  # type: ignore
from orchestrator import answer_with_rag_pg  # type: ignore


CATEGORY_DIR = os.path.join(os.path.dirname(__file__), "category")
ANSWER_DIR = os.path.join(os.path.dirname(__file__), "answer")
CATEGORY_GLOB = os.path.join(CATEGORY_DIR, "*.csv")
TOP_N = 5

SUMMARY_COL = "相談概要"
OUTPUT_FIELDS = [
    "相談年月日",
    "相談区分",
    "対応言語名",
    "相談概要",
    "相談方法",
    "回答",
    "参照QA（カテゴリ名つき）リスト",
]


def _read_rows(path: str) -> List[Dict[str, str]]:
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _load_category_map() -> Dict[int, str]:
    with get_db_cursor() as (cursor, conn):
        cursor.execute("SELECT id, description FROM category")
        rows = cursor.fetchall() or []
    return {int(r["id"]): str(r["description"]) for r in rows if r.get("id") is not None}


def _rank_summaries(rows: List[Dict[str, str]]) -> List[Tuple[str, int]]:
    summaries = [(r.get(SUMMARY_COL) or "").strip() for r in rows]
    summaries = [s for s in summaries if s]
    counts = Counter(summaries)

    first_pos: Dict[str, int] = {}
    for idx, s in enumerate(summaries):
        if s not in first_pos:
            first_pos[s] = idx

    ranked = sorted(counts.items(), key=lambda x: (-x[1], first_pos[x[0]], x[0]))
    return ranked[:TOP_N]


def _pick_representative_row(rows: List[Dict[str, str]], summary: str) -> Dict[str, str]:
    for row in rows:
        if ((row.get(SUMMARY_COL) or "").strip()) == summary:
            return row
    return {}


def _select_references(meta: Dict[str, Any]) -> List[Dict[str, Any]]:
    refs = meta.get("references") or []
    used_ids = set(meta.get("used_source_ids") or [])
    if used_ids:
        return [r for r in refs if r.get("sid") in used_ids]
    return refs


def _format_reference_list(meta: Dict[str, Any], category_map: Dict[int, str]) -> List[Dict[str, Any]]:
    refs = _select_references(meta)
    out: List[Dict[str, Any]] = []
    seen = set()
    for ref in refs:
        qa_id = ref.get("qa_id")
        category_id = ref.get("category_id")
        if qa_id is None:
            continue
        try:
            qa_id_int = int(qa_id)
        except (TypeError, ValueError):
            continue

        category_name = "不明"
        if category_id is not None:
            try:
                category_name = category_map.get(int(category_id), f"category_id:{category_id}")
            except (TypeError, ValueError):
                category_name = f"category_id:{category_id}"

        dedupe_key = (qa_id_int, category_name)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        out.append({"qa_id": qa_id_int, "カテゴリ名": category_name})
    return out


def _build_output_row(
    src_row: Dict[str, str], answer_text: str, references_with_category: List[Dict[str, Any]]
) -> Dict[str, str]:
    return {
        "相談年月日": (src_row.get("相談年月日") or "").strip(),
        "相談区分": (src_row.get("相談区分") or "").strip(),
        "対応言語名": (src_row.get("対応言語名") or "").strip(),
        "相談概要": (src_row.get("相談概要") or "").strip(),
        "相談方法": (src_row.get("相談方法") or "").strip(),
        "回答": answer_text,
        "参照QA（カテゴリ名つき）リスト": json.dumps(references_with_category, ensure_ascii=False),
    }


def _write_rows(path: str, rows: List[Dict[str, str]]) -> None:
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def process_category_file(path: str, category_map: Dict[int, str]) -> str:
    rows = _read_rows(path)
    ranked = _rank_summaries(rows)

    out_rows: List[Dict[str, str]] = []
    total = len(ranked)
    for idx, (summary, count) in enumerate(ranked, 1):
        src_row = _pick_representative_row(rows, summary)
        print(f"[{os.path.basename(path)} {idx}/{total}] {summary} (count={count})")
        result = answer_with_rag_pg(summary, thread_id=None, force_lang="ja")
        meta = result.get("meta", {}) or {}
        refs_with_category = _format_reference_list(meta, category_map)
        out_rows.append(
            _build_output_row(
                src_row=src_row,
                answer_text=result.get("text", ""),
                references_with_category=refs_with_category,
            )
        )

    out_path = os.path.join(ANSWER_DIR, os.path.basename(path))
    _write_rows(out_path, out_rows)
    return out_path


def main() -> int:
    paths = sorted(glob.glob(CATEGORY_GLOB))
    if not paths:
        print(f"No category CSV files found: {CATEGORY_GLOB}")
        return 1

    os.makedirs(ANSWER_DIR, exist_ok=True)
    category_map = _load_category_map()

    for path in paths:
        out = process_category_file(path, category_map)
        print(f"Wrote {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

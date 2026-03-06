#!/usr/bin/env python3
"""
Expand qa_id-based reference lists in Question/answer CSV files
by attaching actual question/answer texts from DB.
"""

from __future__ import annotations

import csv
import glob
import json
import os
import sys
from typing import Any, Dict, List, Set


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
APP_DIR = os.path.join(REPO_ROOT, "app")
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)
DOCKER_APP_DIR = "/var/www"
if DOCKER_APP_DIR not in sys.path and os.path.isdir(DOCKER_APP_DIR):
    sys.path.insert(0, DOCKER_APP_DIR)

from database_utils import get_db_cursor  # type: ignore


ANSWER_DIR = os.path.join(os.path.dirname(__file__), "answer")
ANSWER_GLOB = os.path.join(ANSWER_DIR, "*.csv")
REFERENCE_COL = "参照QA（カテゴリ名つき）リスト"
LANGUAGE_ID = 1


def _read_csv(path: str) -> tuple[list[dict[str, str]], list[str]]:
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fields = reader.fieldnames or []
    return rows, fields


def _write_csv(path: str, rows: list[dict[str, str]], fields: list[str]) -> None:
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def _parse_reference_json(raw: str) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, list):
        return [item for item in parsed if isinstance(item, dict)]
    return []


def _extract_qa_ids(paths: list[str]) -> set[int]:
    qa_ids: set[int] = set()
    for path in paths:
        rows, _ = _read_csv(path)
        for row in rows:
            refs = _parse_reference_json(row.get(REFERENCE_COL, ""))
            for ref in refs:
                qa_id = ref.get("qa_id")
                try:
                    qa_ids.add(int(qa_id))
                except (TypeError, ValueError):
                    continue
    return qa_ids


def _fetch_qa_details(qa_ids: Set[int]) -> Dict[int, Dict[str, str]]:
    if not qa_ids:
        return {}

    ids = sorted(qa_ids)
    ph = ",".join(["%s"] * len(ids))
    sql = f"""
        SELECT
            qa.id AS qa_id,
            c.description AS category_name,
            qt.texts AS question_text,
            at.texts AS answer_text
        FROM QA qa
        JOIN question q ON q.question_id = qa.question_id
        LEFT JOIN category c ON c.id = q.category_id
        LEFT JOIN question_translation qt
            ON qt.question_id = qa.question_id
            AND qt.language_id = %s
        LEFT JOIN answer_translation at
            ON at.answer_id = qa.answer_id
            AND at.language_id = %s
        WHERE qa.id IN ({ph})
    """
    params: list[Any] = [LANGUAGE_ID, LANGUAGE_ID, *ids]

    with get_db_cursor() as (cursor, conn):
        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall() or []

    details: Dict[int, Dict[str, str]] = {}
    for row in rows:
        qa_id = row.get("qa_id")
        if qa_id is None:
            continue
        details[int(qa_id)] = {
            "カテゴリ名": str(row.get("category_name") or ""),
            "質問": str(row.get("question_text") or ""),
            "回答": str(row.get("answer_text") or ""),
        }
    return details


def _expand_refs(raw: str, qa_details: Dict[int, Dict[str, str]]) -> str:
    refs = _parse_reference_json(raw)
    if not refs:
        return json.dumps([], ensure_ascii=False)

    out: list[dict[str, Any]] = []
    seen = set()

    for ref in refs:
        qa_id = ref.get("qa_id")
        try:
            qa_id_int = int(qa_id)
        except (TypeError, ValueError):
            continue

        base = qa_details.get(qa_id_int, {})
        category_name = base.get("カテゴリ名") or str(ref.get("カテゴリ名") or "")
        question_text = base.get("質問", "")
        answer_text = base.get("回答", "")

        dedupe_key = (qa_id_int, category_name, question_text, answer_text)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        out.append(
            {
                "qa_id": qa_id_int,
                "カテゴリ名": category_name,
                "質問": question_text,
                "回答": answer_text,
            }
        )

    return json.dumps(out, ensure_ascii=False)


def main() -> int:
    paths = sorted(glob.glob(ANSWER_GLOB))
    if not paths:
        print(f"No answer files found: {ANSWER_GLOB}")
        return 1

    qa_ids = _extract_qa_ids(paths)
    qa_details = _fetch_qa_details(qa_ids)
    print(f"Resolved {len(qa_details)} QA records from {len(qa_ids)} qa_id values")

    for path in paths:
        rows, fields = _read_csv(path)
        if not fields:
            continue
        if REFERENCE_COL not in fields:
            print(f"Skip {os.path.basename(path)}: missing {REFERENCE_COL}")
            continue

        for row in rows:
            row[REFERENCE_COL] = _expand_refs(row.get(REFERENCE_COL, ""), qa_details)

        _write_csv(path, rows, fields)
        print(f"Rewrote {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Batch-run RAG orchestrator for Question CSV files and emit Answer CSV files.
"""

from __future__ import annotations

import csv
import glob
import json
import os
import sys
from typing import Any, Dict, List


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
APP_DIR = os.path.join(REPO_ROOT, "app")
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)
# Docker実行時は /var/www にアプリが配置されているため、そこも探索対象にする
DOCKER_APP_DIR = "/var/www"
if DOCKER_APP_DIR not in sys.path and os.path.isdir(DOCKER_APP_DIR):
    sys.path.insert(0, DOCKER_APP_DIR)

# Local copy of orchestrator (as requested)
from orchestrator import answer_with_rag_pg  # type: ignore


QUESTION_DIR = os.path.dirname(__file__)
QUESTION_GLOB = os.path.join(QUESTION_DIR, "Question*.csv")
QUESTION_COL = "相談概要"

# 日本語で回答を強制するためのプレフィックス
JA_INSTRUCTION = "【必ず日本語で回答してください】\n\n"


def _select_references(meta: Dict[str, Any]) -> List[Dict[str, Any]]:
    refs = meta.get("references") or []
    used_ids = set(meta.get("used_source_ids") or [])
    if used_ids:
        return [r for r in refs if r.get("sid") in used_ids]
    return refs


def _select_qa_ids(meta: Dict[str, Any]) -> List[int]:
    refs = _select_references(meta)
    qa_ids: List[int] = []
    for ref in refs:
        qa_id = ref.get("qa_id")
        if qa_id is None:
            continue
        try:
            qa_ids.append(int(qa_id))
        except (TypeError, ValueError):
            continue
    return qa_ids


def _read_rows(path: str) -> List[Dict[str, str]]:
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def _write_answers(path: str, rows: List[Dict[str, str]]) -> None:
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["相談内容", "回答内容", "回答に使用したQA_id"],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def process_file(question_path: str) -> str:
    rows = _read_rows(question_path)
    out_rows: List[Dict[str, str]] = []

    total = len(rows)
    for idx, row in enumerate(rows, 1):
        question_text = (row.get(QUESTION_COL) or "").strip()
        if not question_text:
            continue

        print(f"[{idx}/{total}] Question: {question_text}")
        # 日本語での回答を強制
        result = answer_with_rag_pg(question_text, thread_id=None, force_lang="ja")
        meta = result.get("meta", {})
        qa_ids = _select_qa_ids(meta)
        print(f"[{idx}/{total}] Answer: {result.get('text', '')}")
        print(f"[{idx}/{total}] QA IDs: {len(qa_ids)}")

        out_rows.append(
            {
                "相談内容": question_text,
                "回答内容": result.get("text", ""),
                "回答に使用したQA_id": json.dumps(qa_ids, ensure_ascii=False),
            }
        )

    base = os.path.basename(question_path)
    answer_name = base.replace("Question", "Answer", 1)
    answer_path = os.path.join(QUESTION_DIR, answer_name)
    _write_answers(answer_path, out_rows)
    return answer_path


def main() -> int:
    paths = sorted(glob.glob(QUESTION_GLOB))
    if not paths:
        print("No Question*.csv files found.")
        return 1

    for path in paths:
        out_path = process_file(path)
        print(f"Wrote {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

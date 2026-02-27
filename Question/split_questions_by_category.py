#!/usr/bin/env python3
"""
Split Question CSV files into per-category CSV files.
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List


QUESTION_DIR = Path(__file__).resolve().parent
QUESTION_FILE_PATTERN = re.compile(r"^Question\d+\.csv$")
OUTPUT_DIR = QUESTION_DIR / "category"
INPUT_ENCODING = "utf-8-sig"
OUTPUT_FIELDS = [
    "相談年月日",
    "相談区分",
    "対応言語名",
    "相談概要",
    "相談方法",
    "元ファイル",
    "元行番号",
]


def _clean_text(value: str | None) -> str:
    return (value or "").strip()


def _safe_filename(category_name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|]+', "_", category_name).strip()
    if not name:
        return "未分類"
    return name


def _iter_question_files() -> List[Path]:
    return sorted(
        p for p in QUESTION_DIR.iterdir() if p.is_file() and QUESTION_FILE_PATTERN.match(p.name)
    )


def _load_rows_by_category() -> Dict[str, List[Dict[str, str]]]:
    grouped: Dict[str, List[Dict[str, str]]] = defaultdict(list)

    for path in _iter_question_files():
        with path.open("r", encoding=INPUT_ENCODING, newline="") as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader, 1):
                summary = _clean_text(row.get("相談概要"))
                if not summary:
                    continue

                category = _clean_text(row.get("相談区分")) or "未分類"
                grouped[category].append(
                    {
                        "相談年月日": _clean_text(row.get("相談年月日")),
                        "相談区分": category,
                        "対応言語名": _clean_text(row.get("対応言語名")),
                        "相談概要": summary,
                        "相談方法": _clean_text(row.get("相談方法")),
                        "元ファイル": path.name,
                        "元行番号": str(idx),
                    }
                )

    return grouped


def _prepare_output_dir() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for old_csv in OUTPUT_DIR.glob("*.csv"):
        old_csv.unlink()


def _write_grouped_rows(grouped: Dict[str, List[Dict[str, str]]]) -> None:
    for category, rows in sorted(grouped.items(), key=lambda x: x[0]):
        out_path = OUTPUT_DIR / f"{_safe_filename(category)}.csv"
        with out_path.open("w", encoding=INPUT_ENCODING, newline="") as f:
            writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
            writer.writeheader()
            writer.writerows(rows)


def main() -> int:
    grouped = _load_rows_by_category()
    _prepare_output_dir()
    _write_grouped_rows(grouped)

    total_rows = sum(len(rows) for rows in grouped.values())
    print(f"Created {len(grouped)} category files in {OUTPUT_DIR}")
    print(f"Total questions: {total_rows}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

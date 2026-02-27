#!/usr/bin/env python3
"""
Merge category answer CSV files into a single CSV with blank lines between files.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, List


ANSWER_DIR = Path(__file__).resolve().parent / "answer"
OUTPUT_FILE = ANSWER_DIR / "all_categories.csv"
ENCODING = "utf-8-sig"


def _load_rows(path: Path) -> tuple[List[Dict[str, str]], List[str]]:
    with path.open("r", encoding=ENCODING, newline="") as f:
        reader = csv.DictReader(f)
        return list(reader), (reader.fieldnames or [])


def main() -> int:
    files = sorted(
        p
        for p in ANSWER_DIR.glob("*.csv")
        if p.name != OUTPUT_FILE.name
    )
    if not files:
        print("No input CSV files found.")
        return 1

    first_rows, header = _load_rows(files[0])
    if not header:
        print(f"Header not found: {files[0]}")
        return 1

    total_rows = 0

    with OUTPUT_FILE.open("w", encoding=ENCODING, newline="") as out_f:
        writer = csv.DictWriter(out_f, fieldnames=header)
        writer.writeheader()

        for idx, path in enumerate(files):
            rows, file_header = _load_rows(path)
            if file_header != header:
                print(f"Header mismatch: {path.name}")
                return 1

            writer.writerows(rows)
            total_rows += len(rows)
            if idx < len(files) - 1:
                # Insert a physical blank line between category chunks.
                out_f.write("\n")

    print(f"Merged {len(files)} files -> {OUTPUT_FILE}")
    print(f"Total data rows: {total_rows}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

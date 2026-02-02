"""
言語を検出し、languageテーブルのidにマッピングするヘルパ。
Lingua で ISO 639-1 を検出し、DBの code 列と突き合わせて lang_id を返す。
"""

from __future__ import annotations

from typing import Tuple, Optional

from lingua import LanguageDetectorBuilder

from api.rag.vector_store import _get_conn

# 対応許可言語（languageテーブルにある9言語）
ALLOWED_ISO = {"ja", "en", "vi", "zh", "ko", "pt", "es", "tl", "id"}

_DETECTOR = (
    LanguageDetectorBuilder.from_all_languages()
    .with_preloaded_language_models()
    .build()
)


# 文字列から言語コードとlanguage_idを返す
def detect_language(text: str) -> Tuple[str, int]:
    lang = _DETECTOR.detect_language_of(text)
    if lang is None or lang.iso_code_639_1 is None:
        raise ValueError("言語を特定できませんでした。")
    iso = lang.iso_code_639_1.name.lower()
    if iso.startswith("zh"):
        iso = "zh"
    if iso == "jp":
        iso = "ja"
    if iso not in ALLOWED_ISO:
        raise ValueError(f"未対応の言語です: {iso}")

    # DBのlanguageテーブルからidを取得
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM language WHERE code = %s LIMIT 1", (iso,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"languageテーブルにコード {iso} が存在しません。")
            lang_id = row["id"]

    return iso, lang_id


__all__ = ["detect_language"]

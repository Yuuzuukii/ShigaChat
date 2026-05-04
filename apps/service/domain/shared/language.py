from __future__ import annotations

from dataclasses import dataclass


LANGUAGE_NAME_TO_CODE = {
    "日本語": "ja",
    "English": "en",
    "Tiếng Việt": "vi",
    "中文": "zh",
    "한국어": "ko",
    "Português": "pt",
    "Español": "es",
    "Tagalog": "tl",
    "Bahasa Indonesia": "id",
}

LANGUAGE_CODE_TO_ID = {
    "ja": 1,
    "en": 2,
    "vi": 3,
    "zh": 4,
    "ko": 5,
    "pt": 6,
    "es": 7,
    "tl": 8,
    "id": 9,
}

LANGUAGE_ID_TO_CODE = {v: k for k, v in LANGUAGE_CODE_TO_ID.items()}
LANGUAGE_CODE_TO_NAME = {v: k for k, v in LANGUAGE_NAME_TO_CODE.items()}


@dataclass(frozen=True)
class LanguageCode:
    value: str

    @classmethod
    def from_any(cls, value: str | None) -> "LanguageCode":
        raw = (value or "ja").strip()
        if raw in LANGUAGE_NAME_TO_CODE:
            return cls(LANGUAGE_NAME_TO_CODE[raw])
        normalized = raw.lower()
        if normalized.startswith("zh"):
            normalized = "zh"
        if normalized == "fil":
            normalized = "tl"
        if normalized not in LANGUAGE_CODE_TO_ID:
            normalized = "ja"
        return cls(normalized)

    @property
    def id(self) -> int:
        return LANGUAGE_CODE_TO_ID[self.value]

    @property
    def display_name(self) -> str:
        return LANGUAGE_CODE_TO_NAME.get(self.value, "日本語")

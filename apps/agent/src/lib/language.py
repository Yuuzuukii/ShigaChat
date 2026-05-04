from __future__ import annotations

import langid

DEFAULT_LANGUAGE = "en"
LANGUAGE_MAP = {
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

_LANGUAGE_ALIASES = {
    "zh-cn": "zh",
    "zh-tw": "zh",
    "fil": "tl",
}

_PREFIX_ALIASES = {
    "ja": "ja",
    "en": "en",
    "vi": "vi",
    "zh": "zh",
    "ko": "ko",
    "pt": "pt",
    "es": "es",
    "tl": "tl",
    "fil": "tl",
    "id": "id",
}


def normalize_language_code(code: str) -> str:
    normalized = (code or "").strip().lower()
    normalized = _LANGUAGE_ALIASES.get(normalized, normalized)

    if normalized in LANGUAGE_MAP:
        return normalized

    for prefix, target in _PREFIX_ALIASES.items():
        if normalized.startswith(prefix):
            return target

    return DEFAULT_LANGUAGE


def resolve_language(language: str) -> str:
    return normalize_language_code(language or DEFAULT_LANGUAGE)


def detect_language(text: str) -> str:
    detected_language, _ = langid.classify(text or "")
    return normalize_language_code(detected_language)

from __future__ import annotations

import os

from openai import OpenAI

LANGUAGE_NAMES = {
    "ja": "Japanese",
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Chinese",
    "ko": "Korean",
    "pt": "Portuguese",
    "es": "Spanish",
    "tl": "Tagalog",
    "id": "Indonesian",
}

_SAME_LANGUAGE = "in the same language as the Answer"
_COMMON = "Do not add, remove, or alter facts. Keep key names, numbers, and conditions. Output only the resulting text."


def build_system_prompt(action: str, target_lang: str) -> str:
    if action == "translate":
        name = LANGUAGE_NAMES.get(target_lang, target_lang)
        return f"You are a precise translator. Translate the text into {name}. No notes or explanations. {_COMMON}"
    if action == "summarize":
        return f"You are an extractive summarizer. Summarize the text {_SAME_LANGUAGE}. Omit rather than guess. {_COMMON}"
    return (
        f"You are a careful rewriter. Rewrite the text {_SAME_LANGUAGE} so it is easier to understand, "
        f"using short sentences and plain words. {_COMMON}"
    )


class OpenAITextTransformer:
    def __init__(self, model: str | None = None) -> None:
        self.model = model or os.getenv("ACTION_MODEL", "gpt-4.1-nano")
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def transform(self, action: str, text: str, target_lang: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": build_system_prompt(action, target_lang)},
                {"role": "user", "content": text},
            ],
        )
        return (response.choices[0].message.content or "").strip()

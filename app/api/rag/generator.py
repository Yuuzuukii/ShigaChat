"""
LLM呼び出しと回答整形を担当するモジュール。
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Tuple

from openai import OpenAI

@lru_cache(maxsize=1)
def _get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=api_key)


# LLMを呼び出して回答テキストを取得する
def generate_answer(prompt: str, model: str = None) -> Tuple[str, str]:
    model = model or os.getenv("LLM_MODEL", "gpt-5-nano")
    resp = _get_openai_client().responses.create(
        model=model,
        input=prompt,
        reasoning={
            "effort": "minimal"
        }
    )
    text = resp.output_text or ""
    return text, model


# 回答テキストから [S#] のような出典タグを除去する
def strip_citations(answer_text: str) -> str:
    text_no_cite = re.sub(r"\s*\[S\d+\]", "", answer_text)
    t = text_no_cite.replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"[ \t]{2,}", " ", t)
    t = "\n".join(line.rstrip() for line in t.split("\n"))
    clean_text = re.sub(r"\n{3,}", "\n\n", t).strip()
    return clean_text


__all__ = ["generate_answer", "strip_citations"]

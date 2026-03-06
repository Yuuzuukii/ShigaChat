"""
LLM呼び出しと回答整形を担当するモジュール。
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

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


# 直近の会話履歴をベクトル検索クエリ用に要約する
def summarize_history_for_query(
    history_qa: List[Dict[str, Any]],
    model: Optional[str] = None,
) -> str:
    """
    直近の会話履歴（question/answer のリスト）を受け取り、
    ベクトル検索に使いやすい短いキーワード列に要約して返す。
    失敗時は空文字を返す。
    """
    if not history_qa:
        return ""
    model = model or os.getenv("SUMMARY_MODEL", "gpt-4.1-nano")
    # QAをテキスト化
    lines = []
    for item in history_qa:
        q = (item.get("question") or "").strip()[:200]
        a = (item.get("answer") or "").strip()[:200]
        if q:
            lines.append(f"User: {q}")
        if a:
            lines.append(f"Assistant: {a}")
    if not lines:
        return ""
    history_text = "\n".join(lines)
    prompt = (
        "以下の会話履歴を読み、次の検索クエリに使うための重要なキーワードや話題を"
        "50文字以内の日本語で簡潔にまとめてください。箇条書きや説明は不要で、キーワードだけ出力してください。\n\n"
        f"{history_text}"
    )
    try:
        resp = _get_openai_client().responses.create(
            model=model,
            input=prompt,
        )
        return (resp.output_text or "").strip()
    except Exception:
        return ""


__all__ = ["generate_answer", "strip_citations", "summarize_history_for_query"]

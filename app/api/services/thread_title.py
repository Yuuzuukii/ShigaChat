from __future__ import annotations

import re

from langchain_community.chat_models import ChatOpenAI
from langchain.schema import HumanMessage

_QA_Q_PREFIX = re.compile(r"^\s*Q\s*:\s*", re.IGNORECASE)
_QA_A_PREFIX = re.compile(r"^\s*A\s*:\s*", re.IGNORECASE)


def _llm(model: str = "gpt-4.1-nano", timeout_s: int = 20) -> ChatOpenAI:
    return ChatOpenAI(model=model, temperature=0.2, request_timeout=timeout_s)


_LANG_NAME = {
    "ja": "Japanese",
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Chinese (Simplified)",
    "ko": "Korean",
}


def _extract_answer_block(text: str) -> tuple[str | None, str, bool]:
    lines = text.splitlines()
    q_line: str | None = None
    a_start_idx: int | None = None

    for idx, line in enumerate(lines):
        if a_start_idx is None and _QA_A_PREFIX.match(line):
            a_start_idx = idx
            break

    if a_start_idx is None:
        return None, text, False

    for j in range(a_start_idx - 1, -1, -1):
        if _QA_Q_PREFIX.match(lines[j]):
            q_line = _QA_Q_PREFIX.sub("", lines[j]).strip()
            break

    first = _QA_A_PREFIX.sub("", lines[a_start_idx]).strip()
    rest = lines[a_start_idx + 1 :]
    answer_text = "\n".join([first] + rest).strip()
    return q_line, answer_text, True


def title_text(text: str, output_lang_code: str, max_chars: int = 20, strict: bool = False) -> str:
    _q, answer_text, has_qa = _extract_answer_block(text)
    if has_qa:
        text = answer_text

    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    max_chars = max(1, int(max_chars))
    strict_rule = "- This limit is mandatory. Do not exceed it." if strict else "- Keep it as short as possible."
    prompt = (
        f"Summarize the user question into a thread title in {lang_name}.\n"
        f"- Must be {max_chars} characters or fewer.\n"
        f"{strict_rule}\n"
        f"- Output only one line.\n"
        f"- No quotes or prefixes.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    out = resp.content.strip()
    return out.splitlines()[0].strip() if out else ""


from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict

from langchain_community.chat_models import ChatOpenAI
from langchain.schema import HumanMessage

# ---- Intent classification (rule-first, conservative) ---------------------

TRANSLATE_PATTERNS = [
    r"翻訳して", r"訳して", r"英語に", r"日本語に", r"ベトナム語に", r"中国語に", r"韓国語に",
    r"\btranslate\b", r"\bto english\b", r"\bto japanese\b", r"\bto vietnamese\b", r"\bto chinese\b", r"\bto korean\b",
]

SUMMARIZE_PATTERNS = [
    r"要約して", r"まとめて", r"短くして", r"要旨", r"箇条書きに", r"bullet",
    r"\bsummari[sz]e\b", r"\btl;dr\b",
]

REWRITE_PATTERNS = [
    r"言い換え", r"書き換え", r"丁寧に", r"自然な表現に", r"校正", r"文法を直して", r"整形",
    r"\brewrite\b", r"\brephrase\b", r"\bpolish\b", r"\bproofread\b", r"\bformat\b",
]

# ---- Language hints (target selection) -----------------------------------

LANG_HINTS = {
    # ja -> en/ja/vi/zh/ko
    "英語": "en",
    "えいご": "en",
    "日本語": "ja",
    "にほんご": "ja",
    "ベトナム語": "vi",
    "中国語": "zh",
    "韓国語": "ko",
    # en
    "english": "en",
    "japanese": "ja",
    "vietnamese": "vi",
    "chinese": "zh",
    "korean": "ko",
}

# ---- Utilities -----------------------------------------------------------

def _contains_any(text: str, patterns: List[str]) -> bool:
    t = text.lower()
    return any(re.search(p, t) for p in patterns)


def _detect_target_lang(text: str, fallback: str) -> str:
    t = text.lower()
    for hint, code in LANG_HINTS.items():
        if hint in t:
            return code
    return fallback


_QUOTE_REGEX = re.compile(
    r"(?:[\"\']([^\"\']+)[\"\']|「([^」]+)」|『([^』]+)』|“([^”]+)”|”([^”]+)”)"
)


def _extract_inline_target_text(text: str) -> Optional[str]:
    """Try patterns like:
    - "英語に翻訳して: ..." (ASCII colon)
    - "英語に翻訳して：..." (fullwidth colon)
    - Quoted content: "...", '...', 「...」, 『...』, “...”.
    """
    # 1) After colon (both ASCII and fullwidth)
    for sep in (":", "："):
        if sep in text:
            after = text.split(sep, 1)[1].strip()
            if after:
                return after
    # 2) Quoted content
    m = _QUOTE_REGEX.search(text)
    if m:
        # return the first non-None captured group
        for i in range(1, m.lastindex + 1):
            if m.group(i):
                return m.group(i).strip()
    return None

# ---- Helpers for Q/A-formatted texts ------------------------------------

_QA_Q_PREFIX = re.compile(r"^\s*Q\s*:\s*", re.IGNORECASE)
_QA_A_PREFIX = re.compile(r"^\s*A\s*:\s*", re.IGNORECASE)


def _extract_answer_block(text: str) -> Tuple[Optional[str], str, bool]:
    """If text contains a Q/A-style block, return (question, answer, True).
    Otherwise, return (None, original_text, False).

    Heuristics:
    - If a line starting with 'A:' exists, everything from that line onward is the
      answer block (with the leading 'A:' removed).
    - If a preceding line starting with 'Q:' exists, capture it (minus 'Q:').
    """
    lines = text.splitlines()
    q_line: Optional[str] = None
    a_start_idx: Optional[int] = None

    for idx, line in enumerate(lines):
        if a_start_idx is None and _QA_A_PREFIX.match(line):
            a_start_idx = idx
            break

    if a_start_idx is None:
        return None, text, False

    # Find a Q line above if present
    for j in range(a_start_idx - 1, -1, -1):
        if _QA_Q_PREFIX.match(lines[j]):
            q_line = _QA_Q_PREFIX.sub("", lines[j]).strip()
            break

    # Build answer block from A: line to end, removing the first 'A:' prefix
    first = _QA_A_PREFIX.sub("", lines[a_start_idx]).strip()
    rest = lines[a_start_idx + 1 :]
    answer_text = "\n".join([first] + rest).strip()
    return q_line, answer_text, True


# ---- Intent API ----------------------------------------------------------

def classify_intent(question_text: str) -> Optional[Dict[str, str]]:
    """Return a dict like {type: translate|summarize|rewrite} or None.
    Be conservative: only return when clearly reactive.
    """
    if _contains_any(question_text, TRANSLATE_PATTERNS):
        return {"type": "translate"}
    if _contains_any(question_text, SUMMARIZE_PATTERNS):
        return {"type": "summarize"}
    if _contains_any(question_text, REWRITE_PATTERNS):
        return {"type": "rewrite"}
    return None


def resolve_target_text(question_text: str, history_qa: List[Tuple[str, str]]) -> Optional[str]:
    """Choose the text the user likely refers to.
    Priority: inline text in question -> last assistant answer -> last user message.
    history_qa is [(user, bot), ...] in chronological order.
    """
    inline = _extract_inline_target_text(question_text)
    if inline:
        return inline

    if history_qa:
        # last assistant answer first
        last_user, last_bot = history_qa[-1]
        if last_bot and last_bot.strip():
            return last_bot.strip()
        if last_user and last_user.strip():
            return last_user.strip()
    return None

# ---- Lightweight reactive actions via ChatOpenAI -------------------------

def _llm(model: str = "gpt-4.1-nano", timeout_s: int = 20) -> ChatOpenAI:
    # Keep consistent with existing code style (RAG side uses LangChain as well)
    return ChatOpenAI(model=model, temperature=0.2, request_timeout=timeout_s)


_LANG_NAME = {
    "ja": "Japanese",
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Chinese (Simplified)",
    "ko": "Korean",
}


def translate_text(text: str, target_lang_code: str) -> str:
    # If Q/A formatted, translate only the Answer portion
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a

    lang_name = _LANG_NAME.get(target_lang_code, "Japanese")
    prompt = (
        f"Translate the following text into {lang_name} accurately and naturally.\n"
        f"- If the input seems to include a question and answer, translate only the answer content.\n"
        f"- Output only the translated text without any preface, quotes, labels, or extra lines.\n\n"
        f"Text:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    out = resp.content.strip()
    # Final guard: drop any accidental leading 'Q:' lines
    if out.lower().startswith("q:"):
        out = "\n".join([ln for ln in out.splitlines() if not ln.lower().startswith("q:")]).strip()
    return out


def summarize_text(text: str, output_lang_code: str) -> str:
    # Summarize only the Answer portion if Q/A formatted
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a

    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Summarize the following text in {lang_name}.\n"
        f"- Be concise and preserve key facts.\n"
        f"- Use bullet points if it helps clarity.\n\n"
        f"Text:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()


def rewrite_text(text: str, output_lang_code: str, style_hint: Optional[str] = None) -> str:
    # Rewrite only the Answer portion if Q/A formatted
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a

    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    style = style_hint or "more natural and polite"
    prompt = (
        f"Rewrite the following text in {lang_name}, {style}.\n"
        f"- Fix grammar and wording where needed.\n"
        f"- Keep original meaning.\n\n"
        f"Text:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

# ---- Public entrypoint ---------------------------------------------------

@dataclass
class ReactiveConfig:
    default_lang: str = "ja"             # when target language cannot be inferred
    enable_llm_intent: bool = False       # optional: set True if you later add LLM-based intent fallback


def reactive_handle(
    question_text: str,
    history_qa: List[Tuple[str, str]],
    cfg: ReactiveConfig = ReactiveConfig(),
) -> Dict[str, object]:
    """Main entrypoint for the reactive agent.

    Returns:
      - {"type": "translate"|"summarize"|"rewrite", "text": str, "meta": {...}}
      - {"type": "route_to_rag"}
    """
    intent = classify_intent(question_text)

    if not intent:
        # (Optional) place to plug an LLM-based intent classifier if you want
        # ambiguous cases to be caught. Keep disabled by default for safety.
        return {"type": "route_to_rag"}

    ttype = intent["type"]
    target_text = resolve_target_text(question_text, history_qa) or question_text
    target_lang = _detect_target_lang(question_text, cfg.default_lang)

    if ttype == "translate":
        out = translate_text(target_text, target_lang)
        return {"type": "translate", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "summarize":
        out = summarize_text(target_text, target_lang)
        return {"type": "summarize", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "rewrite":
        out = rewrite_text(target_text, target_lang)
        return {"type": "rewrite", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    # Fallback: route to RAG for anything else
    return {"type": "route_to_rag"}

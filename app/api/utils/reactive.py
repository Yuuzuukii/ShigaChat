import re
from typing import List, Tuple, Optional, Dict

from langchain_community.chat_models import ChatOpenAI
from langchain.schema import HumanMessage


# ---- Intent classification (rule-first, conservative) ---------------------

TRANSLATE_PATTERNS = [
    r"翻訳して", r"訳して", r"英語に", r"日本語に", r"ベトナム語に", r"中国語に", r"韓国語に",
    r"translate\b", r"to english", r"to japanese", r"to vietnamese", r"to chinese", r"to korean",
]

SUMMARIZE_PATTERNS = [
    r"要約して", r"まとめて", r"短くして", r"要旨", r"箇条書きに", r"bullet",
    r"summari[sz]e\b", r"tl;dr",
]

REWRITE_PATTERNS = [
    r"言い換え", r"書き換え", r"丁寧に", r"自然な表現に", r"校正", r"文法を直して", r"整形",
    r"rewrite\b", r"rephrase\b", r"polish\b", r"proofread\b", r"format\b",
]


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


def _contains_any(text: str, patterns: List[str]) -> bool:
    t = text.lower()
    return any(re.search(p, t) for p in patterns)


def _detect_target_lang(text: str, fallback: str) -> str:
    t = text.lower()
    for hint, code in LANG_HINTS.items():
        if hint in t:
            return code
    return fallback


def _extract_inline_target_text(text: str) -> Optional[str]:
    # Try patterns like: "英語に翻訳して: ..." or quoted content
    # 1) After colon
    if ":" in text:
        after = text.split(":", 1)[1].strip()
        if after:
            return after
    # 2) Quoted content
    m = re.search(r"[\"\']([^\"\']+)[\"\']", text)
    if m:
        return m.group(1).strip()
    return None


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
        # last assistant answer
        last_user, last_bot = history_qa[-1]
        if last_bot and last_bot.strip():
            return last_bot.strip()
        if last_user and last_user.strip():
            return last_user.strip()
    return None


# ---- Lightweight reactive actions via ChatOpenAI --------------------------

def _llm() -> ChatOpenAI:
    # Keep consistent with existing code style (see RAG.py)
    return ChatOpenAI(model="gpt-4.1-nano", temperature=0.2)


def translate_text(text: str, target_lang_code: str) -> str:
    lang_name = {
        "ja": "Japanese",
        "en": "English",
        "vi": "Vietnamese",
        "zh": "Chinese (Simplified)",
        "ko": "Korean",
    }.get(target_lang_code, "Japanese")

    prompt = (
        f"Translate the following text into {lang_name} accurately and naturally.\n"
        f"Text:\n{text}\n"
        f"Output only the translation."
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()


def summarize_text(text: str, output_lang_code: str) -> str:
    lang_name = {
        "ja": "Japanese",
        "en": "English",
        "vi": "Vietnamese",
        "zh": "Chinese (Simplified)",
        "ko": "Korean",
    }.get(output_lang_code, "Japanese")
    prompt = (
        f"Summarize the following text in {lang_name}.\n"
        f"- Be concise and preserve key facts.\n"
        f"- Use bullet points if it helps clarity.\n\n"
        f"Text:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()


def rewrite_text(text: str, output_lang_code: str, style_hint: Optional[str] = None) -> str:
    lang_name = {
        "ja": "Japanese",
        "en": "English",
        "vi": "Vietnamese",
        "zh": "Chinese (Simplified)",
        "ko": "Korean",
    }.get(output_lang_code, "Japanese")
    style = style_hint or "more natural and polite"
    prompt = (
        f"Rewrite the following text in {lang_name}, {style}.\n"
        f"- Fix grammar and wording where needed.\n"
        f"- Keep original meaning.\n\n"
        f"Text:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()


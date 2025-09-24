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
    r"要約して", r"要約してください", r"要約して下さい", r"要約", r"要約を",
    r"まとめて", r"まとめてください", r"短くして", r"短く", r"要旨",
    r"箇条書きに", r"bullet", r"\bsummari[sz]e\b", r"\btl;dr\b",
]

REWRITE_PATTERNS = [
    r"言い換え", r"書き換え", r"丁寧に", r"自然な表現に", r"校正", r"文法を直して", r"整形",
    r"\brewrite\b", r"\brephrase\b", r"\bpolish\b", r"\bproofread\b", r"\bformat\b",
]

# ---- Additional generic task patterns -----------------------------------

SIMPLIFY_PATTERNS = [
    r"やさしい日本語", r"やさしく説明して", r"噛み砕いて", r"平易に", r"中学生向け", r"小学生向け",
    r"\bsimplify\b", r"\bsimple terms\b", r"\bexplain like\b",
]

EXPAND_PATTERNS = [
    r"詳しく", r"詳述", r"長くして", r"例を?足して", r"補足して", r"背景も", r"詳細に",
    r"\bexpand\b", r"\belaborate\b", r"\bmore detail\b",
]

SHORTEN_PATTERNS = [
    r"短く", r"短くして", r"端的に", r"要点だけ", r"一言で",
    r"\bshorten\b", r"\bconcise\b",
]

BULLETS_PATTERNS = [
    r"箇条書きに", r"箇条書きで", r"リストに", r"項目で",
    r"\bbullet\b", r"\blist\b",
]

OUTLINE_PATTERNS = [
    r"アウトラインに", r"見出し化", r"章立て", r"構成に",
    r"\boutline\b", r"\bheadings?\b",
]

TITLE_PATTERNS = [
    r"タイトルを?つけて", r"件名(を|に)して", r"題名(を|に)して",
    r"\btitle\b", r"\bsubject\b",
]

KEYWORDS_PATTERNS = [
    r"キーワード抽出", r"キーワードを?", r"タグ(化|付け)", r"ハッシュタグ",
    r"\bkeywords?\b", r"\btags?\b", r"\bhashtags?\b",
]

SENTIMENT_PATTERNS = [
    r"感情分析", r"ポジネガ", r"トーンは", r"雰囲気は",
    r"\bsentiment\b", r"\btone\b",
]

FORMAT_PATTERNS = [
    r"jsonにして", r"csvにして", r"markdown(に|表)にして", r"表にして", r"テーブルにして",
    r"\bto json\b", r"\bto csv\b", r"\bto markdown\b", r"\btable\b",
]

PROOFREAD_STRICT_PATTERNS = [
    r"誤字(だけ)?直して", r"文法(だけ)?直して", r"typo",
    r"\bproofread only\b", r"\bfix grammar only\b",
]

STYLE_PATTERNS = [
    r"丁寧(に|語で)", r"カジュアル(に|で)", r"ビジネス(に|で)", r"学術風(に|で)", r"敬語(に|で)",
    r"\bpolite\b", r"\bcasual\b", r"\bbusiness\b", r"\bacademic\b",
]

ENTITIES_PATTERNS = [
    r"(日付|日時|金額|人数|場所|固有名詞).*抽出", r"エンティティ抽出",
    r"\bentities?\b", r"\bner\b",
]

KEYPOINTS_PATTERNS = [
    r"要点(だけ|に)", r"結論(だけ|から)", r"結論→理由",
    r"\bkey points?\b", r"\bhighlights\b",
]

DETECT_LANG_PATTERNS = [
    r"何語", r"言語は", r"言語判定", r"language\?", r"detect language",
]

# ---- Language hints (target selection) -----------------------------------

LANG_HINTS = {
    # ja -> en/ja/vi/zh/ko/pt/es/tl/id
    "英語": "en",
    "えいご": "en",
    "日本語": "ja",
    "にほんご": "ja",
    "ベトナム語": "vi",
    "中国語": "zh",
    "韓国語": "ko",
    "ポルトガル語": "pt",
    "スペイン語": "es",
    "タガログ語": "tl",
    "インドネシア語": "id",
    # en
    "english": "en",
    "japanese": "ja",
    "vietnamese": "vi",
    "chinese": "zh",
    "korean": "ko",
    "portuguese": "pt",
    "spanish": "es",
    "tagalog": "tl",
    "indonesian": "id",
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
    """Return a dict like {type: ...} or None. Priority tuned to be intuitive.
    """
    q = question_text
    # Format conversion first
    if _contains_any(q, FORMAT_PATTERNS):
        return {"type": "format"}
    # Summaries and list/outline
    if _contains_any(q, SUMMARIZE_PATTERNS):
        return {"type": "summarize"}
    if _contains_any(q, BULLETS_PATTERNS):
        return {"type": "bullets"}
    if _contains_any(q, OUTLINE_PATTERNS):
        return {"type": "outline"}
    # Title/keywords/entities/keypoints
    if _contains_any(q, TITLE_PATTERNS):
        return {"type": "title"}
    if _contains_any(q, KEYWORDS_PATTERNS):
        return {"type": "keywords"}
    if _contains_any(q, ENTITIES_PATTERNS):
        return {"type": "entities"}
    if _contains_any(q, KEYPOINTS_PATTERNS):
        return {"type": "keypoints"}
    # Sentiment
    if _contains_any(q, SENTIMENT_PATTERNS):
        return {"type": "sentiment"}
    # Style/simplify/rewrite/length
    if _contains_any(q, SIMPLIFY_PATTERNS):
        return {"type": "simplify"}
    if _contains_any(q, PROOFREAD_STRICT_PATTERNS):
        return {"type": "proofread_strict"}
    if _contains_any(q, REWRITE_PATTERNS):
        return {"type": "rewrite"}
    if _contains_any(q, STYLE_PATTERNS):
        return {"type": "style"}
    if _contains_any(q, SHORTEN_PATTERNS):
        return {"type": "shorten"}
    if _contains_any(q, EXPAND_PATTERNS):
        return {"type": "expand"}
    # Translation / language detect
    if _contains_any(q, TRANSLATE_PATTERNS):
        return {"type": "translate"}
    if _contains_any(q, DETECT_LANG_PATTERNS):
        return {"type": "detect_lang"}
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

# ---- New helpers ---------------------------------------------------------

def simplify_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Rewrite the text in {lang_name} using simpler words for a general audience.\n"
        f"- Keep core facts correct.\n- Use short sentences.\n- Add a brief example if it helps.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def _detect_target_length(question_text: str) -> Optional[int]:
    m = re.search(r"(\d{2,4})\s*(文字|字|chars?|characters?)", question_text, flags=re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    return None

def shorten_text(text: str, output_lang_code: str, question_text: Optional[str] = None) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    target_len = _detect_target_length(question_text or "")
    hint = f" in about {target_len} characters" if target_len else " concisely"
    prompt = (
        f"Summarize the following text in {lang_name}{hint}.\n- Keep key facts.\n- Remove repetitions and tangents.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def expand_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Expand the following text in {lang_name}.\n- Add brief context and a concrete example.\n- Keep the original meaning.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def bullets_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Convert the following into clear bullet points in {lang_name}.\n- Each bullet one idea.\n- Keep key facts and numbers.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def outline_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Create a hierarchical outline with headings in {lang_name}.\n- Use H1/H2/H3 style labels.\n- Keep sections short.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def title_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Generate a single-line, informative title in {lang_name}.\n- ~20 characters if possible.\n- No quotes or prefixes.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def keywords_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Extract 5-10 key terms in {lang_name}.\n- Output as a comma-separated list.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def sentiment_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Classify the sentiment and tone in {lang_name}.\n- Output: label + brief reason (one line).\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def convert_format(text: str, output_lang_code: str, question_text: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    fmt = "json" if re.search(r"json", question_text, re.IGNORECASE) else (
        "csv" if re.search(r"csv", question_text, re.IGNORECASE) else "markdown"
    )
    if fmt == "json":
        prompt = (
            f"Convert to well-formed JSON in {lang_name}.\n- Choose reasonable keys.\n- Output only JSON.\n\nText:\n{text}"
        )
    elif fmt == "csv":
        prompt = (
            f"Convert to CSV in {lang_name}.\n- First line header.\n- Output only CSV.\n\nText:\n{text}"
        )
    else:
        prompt = (
            f"Convert to a Markdown table in {lang_name}.\n- Include header.\n- Output only the table.\n\nText:\n{text}"
        )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def proofread_only_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Fix only typos and grammar in {lang_name}.\n- Do not change meaning or style.\n- Output corrected text only.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def restyle_text(text: str, output_lang_code: str, question_text: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    style = "polite" if re.search(r"丁寧|polite", question_text, re.IGNORECASE) else (
        "casual" if re.search(r"カジュアル|casual", question_text, re.IGNORECASE) else (
        "business" if re.search(r"ビジネス|business", question_text, re.IGNORECASE) else (
        "academic" if re.search(r"学術|academic", question_text, re.IGNORECASE) else "polite")))
    prompt = (
        f"Rewrite in {lang_name} with a {style} tone.\n- Keep original meaning.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def extract_entities_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"Extract entities (dates, amounts, counts, places, proper nouns) in {lang_name}.\n"
        f"- Output as bullet list: type: value.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def keypoints_text(text: str, output_lang_code: str) -> str:
    _q, _a, has_qa = _extract_answer_block(text)
    if has_qa:
        text = _a
    lang_name = _LANG_NAME.get(output_lang_code, "Japanese")
    prompt = (
        f"List 3-5 key points in {lang_name}.\n- If requested, order as conclusion -> reasons.\n\nText:\n{text}"
    )
    resp = _llm().invoke([HumanMessage(content=prompt)])
    return resp.content.strip()

def detect_language_text(text: str) -> str:
    prompt = (
        "Detect the language (ISO-639-1 code and name).\n"
        "Output: code - name.\n\nText:\n" + text
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

    if ttype == "simplify":
        out = simplify_text(target_text, target_lang)
        return {"type": "simplify", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "shorten":
        out = shorten_text(target_text, target_lang, question_text)
        return {"type": "shorten", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "expand":
        out = expand_text(target_text, target_lang)
        return {"type": "expand", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "bullets":
        out = bullets_text(target_text, target_lang)
        return {"type": "bullets", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "outline":
        out = outline_text(target_text, target_lang)
        return {"type": "outline", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "title":
        out = title_text(target_text, target_lang)
        return {"type": "title", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "keywords":
        out = keywords_text(target_text, target_lang)
        return {"type": "keywords", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "entities":
        out = extract_entities_text(target_text, target_lang)
        return {"type": "entities", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "keypoints":
        out = keypoints_text(target_text, target_lang)
        return {"type": "keypoints", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "sentiment":
        out = sentiment_text(target_text, target_lang)
        return {"type": "sentiment", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "format":
        out = convert_format(target_text, target_lang, question_text)
        return {"type": "format", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "proofread_strict":
        out = proofread_only_text(target_text, target_lang)
        return {"type": "proofread_strict", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "style":
        out = restyle_text(target_text, target_lang, question_text)
        return {"type": "style", "text": out, "meta": {"target_lang": target_lang, "source_len": len(target_text)}}

    if ttype == "detect_lang":
        out = detect_language_text(target_text)
        return {"type": "detect_lang", "text": out, "meta": {"source_len": len(target_text)}}

    # Fallback: route to RAG for anything else
    return {"type": "route_to_rag"}

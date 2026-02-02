"""
LLMに渡すプロンプトを組み立てるモジュール。
言語ごとにテンプレートを切り替える。
"""

from __future__ import annotations

from typing import List, Dict, Callable, Optional


def _fmt_contexts(contexts: List[Dict]) -> List[str]:
    lines = ["【コンテキスト】"]
    for i, c in enumerate(contexts, 1):
        lines.append(f"[S{i}] Q: {c.get('question')}")
        lines.append(f"[S{i}] A: {c.get('answer')}")
    return lines


def _fmt_summary(summary: Optional[str]) -> List[str]:
    if not summary:
        return []
    return [
        "",
        "[Conversation context so far]",
        summary,
    ]


def build_prompt_ja(question_text: str, contexts: List[Dict], summary: Optional[str] = None) -> str:
    lines = [
        "あなたは滋賀県国際協会の情報のみを根拠に、事実ベースで簡潔に回答してください。",
        "各文末に [S#] で出典を示し、JSONで返してください。",
        "",
    ]
    lines += _fmt_contexts(contexts)
    lines += _fmt_summary(summary)
    lines += [
        "",
        f"【質問】{question_text}",
        "",
        '出力は次のJSON形式のみ: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_en(question_text: str, contexts: List[Dict], summary: Optional[str] = None) -> str:
    lines = [
        "You are an assistant who answers concisely based only on information about the Shiga International Association.",
        "Add [S#] citation for each sentence and return JSON only.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    lines += _fmt_summary(summary)
    lines += [
        "",
        f"[Question] {question_text}",
        "",
        'Output JSON only: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_vi(question_text: str, contexts: List[Dict], summary: Optional[str] = None) -> str:
    lines = [
        "Bạn chỉ trả lời dựa trên thông tin về Hiệp hội Quốc tế Shiga, ngắn gọn và có trích dẫn [S#] cho mỗi câu.",
        "Trả về kết quả dạng JSON.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    lines += _fmt_summary(summary)
    lines += [
        "",
        f"[Câu hỏi] {question_text}",
        "",
        'Chỉ xuất JSON: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_zh(question_text: str, contexts: List[Dict], summary: Optional[str] = None) -> str:
    lines = [
        "你只能依据有关滋贺县国际协会的信息，简洁回答，每句附 [S#] 引用，并以 JSON 返回。",
        "",
    ]
    lines += _fmt_contexts(contexts)
    lines += _fmt_summary(summary)
    lines += [
        "",
        f"【问题】{question_text}",
        "",
        '仅输出JSON: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_ko(question_text: str, contexts: List[Dict], summary: Optional[str] = None) -> str:
    lines = [
        "당신은 시가현 국제협회 정보만을 근거로 간결하게 답변합니다. 각 문장에 [S#] 출처를 붙이고 JSON으로 반환하세요.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    lines += _fmt_summary(summary)
    lines += [
        "",
        f"[질문] {question_text}",
        "",
        'JSON 형식만 출력: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_pt(question_text: str, contexts: List[Dict], summary: Optional[str] = None) -> str:
    lines = [
        "Responda de forma concisa apenas com informações da Associação Internacional de Shiga, citando [S#] em cada frase. Saída em JSON.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    lines += _fmt_summary(summary)
    lines += [
        "",
        f"[Pergunta] {question_text}",
        "",
        'Saída somente JSON: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_es(question_text: str, contexts: List[Dict], summary: Optional[str] = None) -> str:
    lines = [
        "Responde de forma concisa basándote solo en la Asociación Internacional de Shiga, con citas [S#] en cada frase. Devuelve JSON.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    lines += _fmt_summary(summary)
    lines += [
        "",
        f"[Pregunta] {question_text}",
        "",
        'Solo JSON: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_tl(question_text: str, contexts: List[Dict], summary: Optional[str] = None) -> str:
    lines = [
        "Sumagot nang maikli batay lamang sa impormasyon tungkol sa Shiga International Association; lagyan ng [S#] bawat pangungusap. Ibalik bilang JSON.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    lines += _fmt_summary(summary)
    lines += [
        "",
        f"[Tanong] {question_text}",
        "",
        'JSON lang: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_id(question_text: str, contexts: List[Dict], summary: Optional[str] = None) -> str:
    lines = [
        "Jawab singkat hanya berdasarkan informasi tentang Asosiasi Internasional Shiga, beri kutipan [S#] tiap kalimat. Kembalikan dalam JSON.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    lines += _fmt_summary(summary)
    lines += [
        "",
        f"[Pertanyaan] {question_text}",
        "",
        'Hanya keluaran JSON: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


_BUILDERS: Dict[str, Callable] = {
    "ja": build_prompt_ja,
    "en": build_prompt_en,
    "vi": build_prompt_vi,
    "zh": build_prompt_zh,
    "ko": build_prompt_ko,
    "pt": build_prompt_pt,
    "es": build_prompt_es,
    "tl": build_prompt_tl,
    "id": build_prompt_id,
}


def build_prompt(question_text: str, contexts: List[Dict], lang: str = "ja", summary: Optional[str] = None) -> str:
    builder = _BUILDERS.get(lang, build_prompt_ja)
    return builder(question_text, contexts, summary=summary)


__all__ = ["build_prompt"]
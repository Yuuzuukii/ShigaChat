"""
LLMに渡すプロンプトを組み立てるモジュール。
言語ごとにテンプレートを切り替える。
"""

from __future__ import annotations

from typing import List, Dict, Callable, Optional, Tuple


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


def _fmt_history(history_qa: Optional[List[Tuple[str, str]]]) -> List[str]:
    if not history_qa:
        return []
    lines = ["", "[Recent conversation history]"]
    for i, (q, a) in enumerate(history_qa, 1):
        lines.append(f"[H{i}] User: {q}")
        lines.append(f"[H{i}] Assistant: {a}")
    return lines


def build_prompt_ja(
    question_text: str,
    contexts: List[Dict],
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    lines = [
        "あなたは滋賀県国際協会の情報のみを根拠に、事実ベースで詳しく回答してください。",
        "JSONで返してください。answerには回答本文のみを入れ、本文中に出典記号（[S#]など）は書かないでください。使用した出典IDは used_source_ids に配列で入れてください。",
        "",
    ]
    lines += _fmt_contexts(contexts)
    # lines += _fmt_summary(summary)  # 会話要約は一旦無効化
    lines += _fmt_history(history_qa)
    lines += [
        "",
        f"【質問】{question_text}",
        "",
        '出力は次のJSON形式のみ: {"answer": "...", "used_source_ids": ["S1", "S2"]}',
    ]
    return "\n".join(lines)


def build_prompt_en(
    question_text: str,
    contexts: List[Dict],
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    lines = [
        "You are an assistant who answers concisely and factually based only on information from the Shiga International Association.",
        "Cite sources with [S#] and return JSON. 'answer' should contain your response, and 'used_source_ids' should contain the list of source IDs used.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    # lines += _fmt_summary(summary)  # Conversation summary is intentionally disabled
    lines += _fmt_history(history_qa)
    lines += [
        "",
        f"[Question] {question_text}",
        "",
        'Output JSON only: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_vi(
    question_text: str,
    contexts: List[Dict],
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    lines = [
        "Bạn chỉ trả lời dựa trên thông tin về Hiệp hội Quốc tế Shiga, ngắn gọn và dựa trên thực tế.",
        "Trích dẫn nguồn bằng [S#] và trả về JSON. 'answer' chứa câu trả lời, 'used_source_ids' chứa danh sách ID nguồn đã sử dụng.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    # lines += _fmt_summary(summary)  # Conversation summary is intentionally disabled
    lines += _fmt_history(history_qa)
    lines += [
        "",
        f"[Câu hỏi] {question_text}",
        "",
        'Chỉ xuất JSON: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_zh(
    question_text: str,
    contexts: List[Dict],
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    lines = [
        "你只能依据有关滋贺县国际协会的信息，以事实为基础简洁回答。",
        "使用 [S#] 标注出处，并以 JSON 返回。answer 为回答内容，used_source_ids 为使用的出处ID列表。",
        "",
    ]
    lines += _fmt_contexts(contexts)
    # lines += _fmt_summary(summary)  # Conversation summary is intentionally disabled
    lines += _fmt_history(history_qa)
    lines += [
        "",
        f"【问题】{question_text}",
        "",
        '仅输出JSON: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_ko(
    question_text: str,
    contexts: List[Dict],
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    lines = [
        "당신은 시가현 국제협회 정보만을 근거로 사실 기반으로 간결하게 답변합니다.",
        "[S#] 로 출처를 표시하고 JSON으로 반환하세요. answer에는 답변을, used_source_ids에는 사용한 출처 ID 목록을 넣으세요.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    # lines += _fmt_summary(summary)  # Conversation summary is intentionally disabled
    lines += _fmt_history(history_qa)
    lines += [
        "",
        f"[질문] {question_text}",
        "",
        'JSON 형식만 출력: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_pt(
    question_text: str,
    contexts: List[Dict],
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    lines = [
        "Você é um assistente que responde de forma concisa e baseada em fatos, apenas com informações da Associação Internacional de Shiga.",
        "Indique as fontes com [S#] e retorne em JSON. 'answer' deve conter a resposta e 'used_source_ids' a lista de IDs de fontes utilizadas.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    # lines += _fmt_summary(summary)  # Conversation summary is intentionally disabled
    lines += _fmt_history(history_qa)
    lines += [
        "",
        f"[Pergunta] {question_text}",
        "",
        'Saída somente JSON: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_es(
    question_text: str,
    contexts: List[Dict],
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    lines = [
        "Eres un asistente que responde de forma concisa y basada en hechos, solo con información de la Asociación Internacional de Shiga.",
        "Indica las fuentes con [S#] y devuelve en JSON. 'answer' debe contener la respuesta y 'used_source_ids' la lista de IDs de fuentes utilizadas.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    # lines += _fmt_summary(summary)  # Conversation summary is intentionally disabled
    lines += _fmt_history(history_qa)
    lines += [
        "",
        f"[Pregunta] {question_text}",
        "",
        'Solo JSON: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_tl(
    question_text: str,
    contexts: List[Dict],
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    lines = [
        "Sumagot nang maikli at batay sa katotohanan lamang batay sa impormasyon tungkol sa Shiga International Association.",
        "Ipakita ang pinagkunan gamit ang [S#] at ibalik bilang JSON. Ang 'answer' ay naglalaman ng sagot, at ang 'used_source_ids' ay naglalaman ng listahan ng mga ginamit na ID ng pinagkunan.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    # lines += _fmt_summary(summary)  # Conversation summary is intentionally disabled
    lines += _fmt_history(history_qa)
    lines += [
        "",
        f"[Tanong] {question_text}",
        "",
        'JSON lang: {"answer": "...", "used_source_ids": ["S1"]}',
    ]
    return "\n".join(lines)


def build_prompt_id(
    question_text: str,
    contexts: List[Dict],
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    lines = [
        "Jawab singkat dan berbasis fakta hanya berdasarkan informasi tentang Asosiasi Internasional Shiga.",
        "Tunjukkan sumber dengan [S#] dan kembalikan dalam JSON. 'answer' berisi jawaban, dan 'used_source_ids' berisi daftar ID sumber yang digunakan.",
        "",
    ]
    lines += _fmt_contexts(contexts)
    # lines += _fmt_summary(summary)  # Conversation summary is intentionally disabled
    lines += _fmt_history(history_qa)
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


def build_prompt(
    question_text: str,
    contexts: List[Dict],
    lang: str = "ja",
    summary: Optional[str] = None,
    history_qa: Optional[List[Tuple[str, str]]] = None,
) -> str:
    builder = _BUILDERS.get(lang, build_prompt_ja)
    return builder(question_text, contexts, summary=summary, history_qa=history_qa)


__all__ = ["build_prompt"]

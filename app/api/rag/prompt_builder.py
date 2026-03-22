"""
LLMに渡すプロンプトを組み立てるモジュール。
言語ごとにテンプレートを切り替える。
"""

from __future__ import annotations

import json
from typing import Any, Callable, Dict, List, Optional, Sequence


_JA_FALLBACK_PREFIX = "滋賀県国際協会の情報にはないので，一般知識で回答します。"
_EN_FALLBACK_PREFIX = "This information is not available from the Shiga International Association, so I will answer from general knowledge."
_VI_FALLBACK_PREFIX = "Thông tin này không có trong nguồn của Hiệp hội Quốc tế Shiga, vì vậy tôi sẽ trả lời bằng kiến thức chung."
_ZH_FALLBACK_PREFIX = "滋贺县国际协会的信息中没有，所以我将根据一般知识回答。"
_KO_FALLBACK_PREFIX = "시가현 국제협회 정보에는 없으므로 일반 지식으로 답변하겠습니다."
_PT_FALLBACK_PREFIX = "Essa informação não está disponível nas informações da Associação Internacional de Shiga, então responderei com conhecimento geral."
_ES_FALLBACK_PREFIX = "Esta información no está en la información de la Asociación Internacional de Shiga, así que responderé con conocimiento general."
_TL_FALLBACK_PREFIX = "Wala ito sa impormasyon ng Shiga International Association kaya sasagot ako gamit ang pangkalahatang kaalaman."
_ID_FALLBACK_PREFIX = "Informasi ini tidak ada dalam informasi Asosiasi Internasional Shiga, jadi saya akan menjawab dengan pengetahuan umum."


_PROMPT_CONFIGS: Dict[str, Dict[str, Any]] = {
    "ja": {
        "base": "あなたは滋賀県国際協会の参照QAをもとに回答するアシスタントです。",
        "fallback_prefix": _JA_FALLBACK_PREFIX,
        "with_context": [
            f"参照QAだけでは答えられない場合は、used_source_ids を空配列にし、回答の冒頭を「{_JA_FALLBACK_PREFIX}」で始め、その後に一般知識による実質的な回答を最後まで続けてください。",
        ],
        "without_context": [
            "参照QAがありません。会話履歴も参考にしながら、一般知識と推論で回答してください。",
            f"回答の冒頭は必ず「{_JA_FALLBACK_PREFIX}」で始めてください。",
            "回答は途中で止めず、used_source_ids は空配列にしてください。",
        ],
        "json_instruction": "JSONで返してください。answer には回答本文のみを入れ、本文中に出典記号（[S#]など）は書かないでください。使用した出典IDは used_source_ids に配列で入れてください。",
        "question_prefix": "【質問】",
        "output_with_context": '出力は次のJSON形式のみ: {"answer": "...", "used_source_ids": ["S1", "S2"]}',
        "output_without_context": '出力は次のJSON形式のみ: {"answer": "...", "used_source_ids": []}',
    },
    "en": {
        "base": "You are an assistant that answers using Shiga International Association QA references.",
        "fallback_prefix": _EN_FALLBACK_PREFIX,
        "with_context": [
            f"If the reference QA alone cannot answer, set used_source_ids to an empty array, begin the answer with \"{_EN_FALLBACK_PREFIX}\", and then continue with a substantive general-knowledge answer to the end.",
        ],
        "without_context": [
            "No reference QA is available. Use the conversation history as needed and answer with general knowledge and reasoning.",
            f"Begin the answer with \"{_EN_FALLBACK_PREFIX}\".",
            "Do not stop midway, and set used_source_ids to an empty array.",
        ],
        "json_instruction": "Return JSON only. Put only the answer body in 'answer' without [S#] markers, and put the source IDs you actually used in 'used_source_ids'.",
        "question_prefix": "[Question] ",
        "output_with_context": 'Output JSON only: {"answer": "...", "used_source_ids": ["S1"]}',
        "output_without_context": 'Output JSON only: {"answer": "...", "used_source_ids": []}',
    },
    "vi": {
        "base": "Bạn là trợ lý trả lời dựa trên các QA tham chiếu của Hiệp hội Quốc tế Shiga.",
        "fallback_prefix": _VI_FALLBACK_PREFIX,
        "with_context": [
            f"Nếu chỉ riêng QA tham chiếu không thể trả lời, hãy đặt used_source_ids thành mảng rỗng, bắt đầu câu trả lời bằng \"{_VI_FALLBACK_PREFIX}\", rồi tiếp tục trả lời thực chất bằng kiến thức chung cho đến hết.",
        ],
        "without_context": [
            "Không có QA tham chiếu. Hãy tham khảo lịch sử hội thoại khi cần và trả lời bằng kiến thức cùng suy luận chung.",
            f"Bắt đầu câu trả lời bằng \"{_VI_FALLBACK_PREFIX}\".",
            "Đừng dừng giữa chừng, và hãy đặt used_source_ids thành mảng rỗng.",
        ],
        "json_instruction": "Chỉ trả về JSON. 'answer' chỉ chứa nội dung câu trả lời, không có ký hiệu [S#]; 'used_source_ids' chứa các ID nguồn thực sự đã dùng.",
        "question_prefix": "[Câu hỏi] ",
        "output_with_context": 'Chỉ xuất JSON: {"answer": "...", "used_source_ids": ["S1"]}',
        "output_without_context": 'Chỉ xuất JSON: {"answer": "...", "used_source_ids": []}',
    },
    "zh": {
        "base": "你是一个基于滋贺县国际协会参考QA来回答问题的助手。",
        "fallback_prefix": _ZH_FALLBACK_PREFIX,
        "with_context": [
            f"如果仅靠参考QA无法作答，请将 used_source_ids 设为空数组，并以“{_ZH_FALLBACK_PREFIX}”开头，然后继续完整地给出基于常识的实质性回答。",
        ],
        "without_context": [
            "没有参考QA。请在需要时参考对话历史，并结合常识与推理来回答。",
            f"回答必须以“{_ZH_FALLBACK_PREFIX}”开头。",
            "不要中途结束，并且 used_source_ids 必须为空数组。",
        ],
        "json_instruction": "只返回 JSON。answer 只放回答正文，不要包含 [S#] 标记；used_source_ids 只放实际使用到的来源ID。",
        "question_prefix": "【问题】",
        "output_with_context": '仅输出JSON: {"answer": "...", "used_source_ids": ["S1"]}',
        "output_without_context": '仅输出JSON: {"answer": "...", "used_source_ids": []}',
    },
    "ko": {
        "base": "당신은 시가현 국제협회의 참고 QA를 바탕으로 답변하는 도우미입니다.",
        "fallback_prefix": _KO_FALLBACK_PREFIX,
        "with_context": [
            f"참고 QA만으로 답할 수 없다면 used_source_ids 를 빈 배열로 두고, 답변을 \"{_KO_FALLBACK_PREFIX}\"로 시작한 뒤 일반 지식에 따른 실질적인 답변을 끝까지 이어서 작성하세요.",
        ],
        "without_context": [
            "참고 QA가 없습니다. 필요하면 대화 이력을 참고하고 일반 지식과 추론으로 답변하세요.",
            f"답변은 반드시 \"{_KO_FALLBACK_PREFIX}\"로 시작하세요.",
            "중간에 멈추지 말고, used_source_ids 는 빈 배열로 두세요.",
        ],
        "json_instruction": "JSON만 반환하세요. answer에는 답변 본문만 넣고 [S#] 표시는 넣지 마세요. 실제로 사용한 출처 ID만 used_source_ids 에 넣으세요.",
        "question_prefix": "[질문] ",
        "output_with_context": 'JSON 형식만 출력: {"answer": "...", "used_source_ids": ["S1"]}',
        "output_without_context": 'JSON 형식만 출력: {"answer": "...", "used_source_ids": []}',
    },
    "pt": {
        "base": "Você é um assistente que responde com base nas referências de QA da Associação Internacional de Shiga.",
        "fallback_prefix": _PT_FALLBACK_PREFIX,
        "with_context": [
            f"Se apenas a QA de referência não puder responder, defina used_source_ids como um array vazio, comece a resposta com \"{_PT_FALLBACK_PREFIX}\" e depois continue com uma resposta substantiva baseada em conhecimento geral até o final.",
        ],
        "without_context": [
            "Não há QA de referência. Consulte o histórico da conversa quando necessário e responda com conhecimento geral e raciocínio.",
            f"Comece a resposta com \"{_PT_FALLBACK_PREFIX}\".",
            "Não pare no meio e defina used_source_ids como um array vazio.",
        ],
        "json_instruction": "Retorne apenas JSON. Coloque somente o corpo da resposta em 'answer', sem marcadores [S#], e coloque em 'used_source_ids' apenas os IDs de fontes realmente usados.",
        "question_prefix": "[Pergunta] ",
        "output_with_context": 'Saída somente JSON: {"answer": "...", "used_source_ids": ["S1"]}',
        "output_without_context": 'Saída somente JSON: {"answer": "...", "used_source_ids": []}',
    },
    "es": {
        "base": "Eres un asistente que responde basándose en las referencias de QA de la Asociación Internacional de Shiga.",
        "fallback_prefix": _ES_FALLBACK_PREFIX,
        "with_context": [
            f"Si solo con la QA de referencia no se puede responder, pon used_source_ids como un arreglo vacío, empieza la respuesta con \"{_ES_FALLBACK_PREFIX}\" y luego continúa con una respuesta sustantiva basada en conocimiento general hasta el final.",
        ],
        "without_context": [
            "No hay QA de referencia. Usa el historial de la conversación cuando sea necesario y responde con conocimiento general y razonamiento.",
            f"Empieza la respuesta con \"{_ES_FALLBACK_PREFIX}\".",
            "No te detengas a medias y pon used_source_ids como un arreglo vacío.",
        ],
        "json_instruction": "Devuelve solo JSON. En 'answer' pon solo el cuerpo de la respuesta, sin marcadores [S#], y en 'used_source_ids' solo los IDs de fuentes realmente usados.",
        "question_prefix": "[Pregunta] ",
        "output_with_context": 'Solo JSON: {"answer": "...", "used_source_ids": ["S1"]}',
        "output_without_context": 'Solo JSON: {"answer": "...", "used_source_ids": []}',
    },
    "tl": {
        "base": "Ikaw ay assistant na sumasagot batay sa mga QA reference ng Shiga International Association.",
        "fallback_prefix": _TL_FALLBACK_PREFIX,
        "with_context": [
            f"Kung hindi masasagot gamit lamang ang reference QA, gawing empty array ang used_source_ids, simulan ang sagot sa \"{_TL_FALLBACK_PREFIX}\", at pagkatapos ay ipagpatuloy ang makabuluhang sagot batay sa pangkalahatang kaalaman hanggang dulo.",
        ],
        "without_context": [
            "Walang reference QA. Gamitin ang history ng pag-uusap kung kinakailangan at sumagot gamit ang pangkalahatang kaalaman at pangangatwiran.",
            f"Simulan ang sagot sa \"{_TL_FALLBACK_PREFIX}\".",
            "Huwag tumigil sa gitna, at gawing empty array ang used_source_ids.",
        ],
        "json_instruction": "JSON lang ang ibalik. Sa 'answer', ilagay lamang ang mismong sagot at huwag maglagay ng [S#] markers. Sa 'used_source_ids', ilagay lamang ang mga source ID na aktwal na ginamit.",
        "question_prefix": "[Tanong] ",
        "output_with_context": 'JSON lang: {"answer": "...", "used_source_ids": ["S1"]}',
        "output_without_context": 'JSON lang: {"answer": "...", "used_source_ids": []}',
    },
    "id": {
        "base": "Anda adalah asisten yang menjawab berdasarkan referensi QA dari Asosiasi Internasional Shiga.",
        "fallback_prefix": _ID_FALLBACK_PREFIX,
        "with_context": [
            f"Jika QA referensi saja tidak dapat menjawab, setel used_source_ids ke array kosong, mulai jawaban dengan \"{_ID_FALLBACK_PREFIX}\", lalu lanjutkan dengan jawaban substantif berbasis pengetahuan umum sampai selesai.",
        ],
        "without_context": [
            "Tidak ada QA referensi. Gunakan riwayat percakapan bila perlu dan jawablah dengan pengetahuan umum serta penalaran Anda.",
            f"Mulailah jawaban dengan \"{_ID_FALLBACK_PREFIX}\".",
            "Jangan berhenti di tengah, dan setel used_source_ids ke array kosong.",
        ],
        "json_instruction": "Kembalikan hanya JSON. Isi 'answer' hanya dengan isi jawaban tanpa penanda [S#], dan isi 'used_source_ids' hanya dengan ID sumber yang benar-benar digunakan.",
        "question_prefix": "[Pertanyaan] ",
        "output_with_context": 'Hanya keluaran JSON: {"answer": "...", "used_source_ids": ["S1"]}',
        "output_without_context": 'Hanya keluaran JSON: {"answer": "...", "used_source_ids": []}',
    },
}


def _get_prompt_config(lang: str) -> Dict[str, Any]:
    return _PROMPT_CONFIGS.get(lang, _PROMPT_CONFIGS["ja"])


def get_fallback_prefix(lang: str) -> str:
    return _get_prompt_config(lang)["fallback_prefix"]


def normalize_fallback_prefix(
    answer_text: str,
    *,
    lang: str,
    used_source_ids: Optional[Sequence[str]],
) -> str:
    if not answer_text or not used_source_ids:
        return answer_text

    prefix = get_fallback_prefix(lang)
    if prefix and answer_text.startswith(prefix):
        return answer_text[len(prefix):].lstrip()
    return answer_text


def _fmt_contexts(contexts: List[Dict[str, Any]]) -> List[str]:
    lines = ["【コンテキスト】"]
    if not contexts:
        lines.append("なし")
        return lines
    for i, c in enumerate(contexts, 1):
        lines.append(f"[S{i}] Q: {c.get('question')}")
        lines.append(f"[S{i}] A: {c.get('answer')}")
    return lines


def _fmt_history(history_qa: Optional[List[Any]]) -> List[str]:
    if not history_qa:
        return []

    lines = ["", "[Recent conversation history]"]
    for i, item in enumerate(history_qa, 1):
        if isinstance(item, dict):
            q = item.get("question")
            a = item.get("answer")
            rag_qa = item.get("rag_qa")
        else:
            q, a = item
            rag_qa = None
        lines.append(f"[H{i}] User: {q}")
        lines.append(f"[H{i}] Assistant: {a}")
        if rag_qa:
            lines.append(f"[H{i}] Retrieved DB context: {json.dumps(rag_qa, ensure_ascii=False)}")
    return lines


def _build_prompt_from_config(
    question_text: str,
    contexts: List[Dict[str, Any]],
    history_qa: Optional[List[Any]],
    config: Dict[str, Any],
) -> str:
    lines = [config["base"]]
    lines += config["with_context"] if contexts else config["without_context"]
    lines += [config["json_instruction"], ""]
    lines += _fmt_contexts(contexts)
    lines += _fmt_history(history_qa)
    lines += [
        "",
        f"{config['question_prefix']}{question_text}",
        "",
        config["output_with_context"] if contexts else config["output_without_context"],
    ]
    return "\n".join(lines)


def build_prompt_ja(
    question_text: str,
    contexts: List[Dict[str, Any]],
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    return _build_prompt_from_config(question_text, contexts, history_qa, _PROMPT_CONFIGS["ja"])


def build_prompt_en(
    question_text: str,
    contexts: List[Dict[str, Any]],
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    return _build_prompt_from_config(question_text, contexts, history_qa, _PROMPT_CONFIGS["en"])


def build_prompt_vi(
    question_text: str,
    contexts: List[Dict[str, Any]],
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    return _build_prompt_from_config(question_text, contexts, history_qa, _PROMPT_CONFIGS["vi"])


def build_prompt_zh(
    question_text: str,
    contexts: List[Dict[str, Any]],
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    return _build_prompt_from_config(question_text, contexts, history_qa, _PROMPT_CONFIGS["zh"])


def build_prompt_ko(
    question_text: str,
    contexts: List[Dict[str, Any]],
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    return _build_prompt_from_config(question_text, contexts, history_qa, _PROMPT_CONFIGS["ko"])


def build_prompt_pt(
    question_text: str,
    contexts: List[Dict[str, Any]],
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    return _build_prompt_from_config(question_text, contexts, history_qa, _PROMPT_CONFIGS["pt"])


def build_prompt_es(
    question_text: str,
    contexts: List[Dict[str, Any]],
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    return _build_prompt_from_config(question_text, contexts, history_qa, _PROMPT_CONFIGS["es"])


def build_prompt_tl(
    question_text: str,
    contexts: List[Dict[str, Any]],
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    return _build_prompt_from_config(question_text, contexts, history_qa, _PROMPT_CONFIGS["tl"])


def build_prompt_id(
    question_text: str,
    contexts: List[Dict[str, Any]],
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    return _build_prompt_from_config(question_text, contexts, history_qa, _PROMPT_CONFIGS["id"])


_BUILDERS: Dict[str, Callable[..., str]] = {
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
    contexts: List[Dict[str, Any]],
    lang: str = "ja",
    summary: Optional[str] = None,
    history_qa: Optional[List[Any]] = None,
) -> str:
    builder = _BUILDERS.get(lang, build_prompt_ja)
    return builder(question_text, contexts, summary=summary, history_qa=history_qa)


__all__ = ["build_prompt", "get_fallback_prefix", "normalize_fallback_prefix"]

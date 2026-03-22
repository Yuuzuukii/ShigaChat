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
            "参照QAがある場合は、まず参照QAの内容を要約して回答してください。質問文が完全一致でなくても、意味が近い言い換えなら参照QAを使ってください。",
            f"参照QAで答えられる限り、一般知識には切り替えず、回答の冒頭に「{_JA_FALLBACK_PREFIX}」と書かないでください。",
            f"参照QAだけでは本当に答えられない場合に限って、used_source_ids を空配列にし、回答の冒頭を「{_JA_FALLBACK_PREFIX}」で始め、その後に一般知識による実質的な回答を最後まで続けてください。",
            "「このコンテキストには情報がありません」だけで終わらせないでください。",
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
            "When reference QA is available, answer by summarizing the relevant reference QA first. Close paraphrases or wording differences still count as usable references.",
            f"If the reference QA answers the question, do not switch to general knowledge and do not begin the answer with \"{_EN_FALLBACK_PREFIX}\".",
            f"Only when the reference QA truly does not answer the question should you set used_source_ids to an empty array, begin the answer with \"{_EN_FALLBACK_PREFIX}\", and continue with a complete general-knowledge answer.",
            "Do not stop after only saying the context lacks the information.",
        ],
        "without_context": [
            "No retrieved QA reference is available. Use the conversation history plus your own general knowledge and reasoning to answer.",
            f"Begin the answer with \"{_EN_FALLBACK_PREFIX}\".",
            "Do not stop midway. used_source_ids must be an empty array.",
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
            "Khi có QA tham chiếu, hãy ưu tiên tóm tắt QA phù hợp để trả lời. Những cách diễn đạt gần nghĩa vẫn được xem là có thể sử dụng.",
            f"Neu QA tham chieu tra loi duoc cau hoi, dung chuyen sang kien thuc chung va dung mo dau bang \"{_VI_FALLBACK_PREFIX}\".",
            f"Chỉ khi QA tham chiếu thực sự không trả lời được câu hỏi thì mới đặt used_source_ids thành mảng rỗng, mở đầu bằng \"{_VI_FALLBACK_PREFIX}\", rồi tiếp tục trả lời đầy đủ bằng kiến thức chung.",
            "Không được chỉ nói rằng ngữ cảnh không có thông tin rồi dừng lại.",
        ],
        "without_context": [
            "Không có QA tham chiếu nào được truy xuất. Hãy dựa vào lịch sử hội thoại cùng kiến thức và suy luận chung để trả lời.",
            f"Bắt đầu câu trả lời bằng \"{_VI_FALLBACK_PREFIX}\".",
            "Đừng dừng lại giữa chừng. used_source_ids phải là mảng rỗng.",
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
            "有参考QA时，请先概括相关参考QA来回答。即使只是近义改写或措辞不同，也仍然算可用参考。",
            f"如果参考QA已经能回答问题，就不要切换到常识回答，也不要以“{_ZH_FALLBACK_PREFIX}”开头。",
            f"只有在参考QA确实无法回答问题时，才把 used_source_ids 设为空数组，并以“{_ZH_FALLBACK_PREFIX}”开头，然后继续给出完整的常识回答。",
            "不要只说上下文没有信息就结束。",
        ],
        "without_context": [
            "没有检索到参考QA。请结合对话历史以及你自己的常识和推理来回答。",
            f"回答必须以“{_ZH_FALLBACK_PREFIX}”开头。",
            "不要中途结束。used_source_ids 必须为空数组。",
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
            "참고 QA가 있으면 먼저 관련 참고 QA를 요약해 답하세요. 완전 일치가 아니어도 의미가 가까운 말바꾸기라면 참고 QA를 사용할 수 있습니다.",
            f"참고 QA로 답할 수 있다면 일반 지식으로 전환하지 말고, 답변을 \"{_KO_FALLBACK_PREFIX}\"로 시작하지 마세요.",
            f"참고 QA가 정말로 답을 주지 못할 때만 used_source_ids 를 빈 배열로 두고, 답변을 \"{_KO_FALLBACK_PREFIX}\"로 시작한 뒤 일반 지식에 따른 완전한 답변을 이어서 작성하세요.",
            "컨텍스트에 정보가 없다고만 말하고 끝내지 마세요.",
        ],
        "without_context": [
            "검색된 참고 QA가 없습니다. 대화 이력과 당신의 일반 지식 및 추론을 사용해 답변하세요.",
            f"답변은 반드시 \"{_KO_FALLBACK_PREFIX}\"로 시작하세요.",
            "중간에 멈추지 마세요. used_source_ids 는 반드시 빈 배열이어야 합니다.",
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
            "Quando houver QA de referência, responda primeiro resumindo a referência relevante. Paráfrases próximas ou diferenças de redação ainda contam como referência utilizável.",
            f"Se a referência responder à pergunta, não mude para conhecimento geral e não comece a resposta com \"{_PT_FALLBACK_PREFIX}\".",
            f"Só quando a referência realmente não responder à pergunta você deve definir used_source_ids como um array vazio, começar a resposta com \"{_PT_FALLBACK_PREFIX}\" e continuar com uma resposta completa baseada em conhecimento geral.",
            "Não pare apenas dizendo que o contexto não contém a informação.",
        ],
        "without_context": [
            "Nenhuma referência de QA foi recuperada. Use o histórico da conversa junto com seu conhecimento geral e raciocínio para responder.",
            f"Comece a resposta com \"{_PT_FALLBACK_PREFIX}\".",
            "Não pare no meio. used_source_ids deve ser um array vazio.",
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
            "Cuando haya QA de referencia, responde primero resumiendo la referencia relevante. Las paráfrasis cercanas o diferencias de redacción también cuentan como referencias utilizables.",
            f"Si la referencia responde la pregunta, no cambies a conocimiento general y no empieces la respuesta con \"{_ES_FALLBACK_PREFIX}\".",
            f"Solo cuando la referencia realmente no responda la pregunta debes poner used_source_ids como un arreglo vacío, empezar la respuesta con \"{_ES_FALLBACK_PREFIX}\" y continuar con una respuesta completa basada en conocimiento general.",
            "No termines solo diciendo que el contexto no contiene la información.",
        ],
        "without_context": [
            "No hay ninguna referencia QA recuperada. Usa el historial de la conversación junto con tu conocimiento general y razonamiento para responder.",
            f"Empieza la respuesta con \"{_ES_FALLBACK_PREFIX}\".",
            "No te detengas a medias. used_source_ids debe ser un arreglo vacío.",
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
            "Kapag may reference QA, sagutin muna sa pamamagitan ng pagbuod ng kaugnay na reference QA. Ang malapit na paraphrase o magkaibang wording ay maaari pa ring ituring na magagamit na reference.",
            f"Kung sapat ang reference QA para sagutin ang tanong, huwag lumipat sa pangkalahatang kaalaman at huwag simulan ang sagot sa \"{_TL_FALLBACK_PREFIX}\".",
            f"Kung talagang hindi nasasagot ng reference QA ang tanong, saka lamang gawing empty array ang used_source_ids, simulan ang sagot sa \"{_TL_FALLBACK_PREFIX}\", at ipagpatuloy ang isang kumpletong sagot batay sa pangkalahatang kaalaman.",
            "Huwag magtapos sa pagsasabing walang impormasyon ang context.",
        ],
        "without_context": [
            "Walang narekober na QA reference. Gamitin ang history ng pag-uusap kasama ang iyong pangkalahatang kaalaman at pangangatwiran upang sumagot.",
            f"Simulan ang sagot sa \"{_TL_FALLBACK_PREFIX}\".",
            "Huwag tumigil sa gitna. Dapat empty array ang used_source_ids.",
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
            "Jika ada QA referensi, jawablah terlebih dahulu dengan merangkum referensi yang relevan. Parafrasa yang dekat atau perbedaan redaksi tetap dihitung sebagai referensi yang bisa dipakai.",
            f"Jika referensi menjawab pertanyaan, jangan beralih ke pengetahuan umum dan jangan memulai jawaban dengan \"{_ID_FALLBACK_PREFIX}\".",
            f"Hanya jika referensi benar-benar tidak menjawab pertanyaan, setel used_source_ids ke array kosong, mulai jawaban dengan \"{_ID_FALLBACK_PREFIX}\", lalu lanjutkan dengan jawaban lengkap berdasarkan pengetahuan umum.",
            "Jangan berhenti hanya dengan mengatakan bahwa konteks tidak memiliki informasi.",
        ],
        "without_context": [
            "Tidak ada referensi QA yang ditemukan. Gunakan riwayat percakapan bersama pengetahuan umum dan penalaran Anda untuk menjawab.",
            f"Mulailah jawaban dengan \"{_ID_FALLBACK_PREFIX}\".",
            "Jangan berhenti di tengah. used_source_ids harus berupa array kosong.",
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

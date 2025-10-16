from fastapi import APIRouter, HTTPException, Depends
from api.routes.user import current_user_info
from typing import Literal, Optional
from datetime import datetime
from database_utils import get_db_cursor, get_placeholder
from pydantic import BaseModel
from langchain_community.chat_models import ChatOpenAI
from langchain.schema import SystemMessage, HumanMessage


router = APIRouter()


class ActionPayload(BaseModel):
    # Preferred contextual fields
    question: Optional[str] = None
    answer: Optional[str] = None
    # Backward-compat fallback
    text: Optional[str] = None
    action: Literal["translate", "summarize", "simplify"]
    target_lang: Optional[str] = None  # e.g., "ja", "en", "zh", "vi", "ko"
    thread_id: Optional[int] = None
    action_label: Optional[str] = None  # localized label to save in history


_LABEL_TO_CODE = {
    "日本語": "ja",
    "English": "en",
    "Tiếng Việt": "vi",
    "中文": "zh",
    "한국어": "ko",
    "Português": "pt",
    "Español": "es",
    "Tagalog": "tl",
    "Bahasa Indonesia": "id",
}


def _build_system_prompt(action: str, target_lang: Optional[str], ui_lang: str) -> str:
    # Localized system prompts by UI language
    prompts = {
        "ja": {
            "translate": lambda tgt: (
                f"あなたは厳密な翻訳者です。以下の『回答(Answer)』だけを {tgt} に翻訳してください。"
                "『質問(Question)』を使って内容を付け足したり推測したりしないでください。"
                "注釈や説明は付けず、事実・固有名詞・数値・条件を厳密に保持し、翻訳結果のみを出力してください。"
            ),
            "summarize": (
                "あなたは抽出演算の要約者です。以下の『回答(Answer)』だけを同じ言語で要約してください。"
                "新しい事実・解釈・推測を加えず、『質問(Question)』を根拠に内容を付け足さないでください。"
                "重要な固有名詞・数値・条件を維持し、不確かな場合は推測せず省略してください。出力は要約のみ。"
            ),
            "simplify": (
                "あなたは丁寧なリライターです。以下の『回答(Answer)』だけを、意味を変えずに同じ言語でわかりやすく書き直してください。"
                "事実の追加・削除・改変や、『質問(Question)』からの補足は禁止です。"
                "重要な情報は残し、短い文・平易な語彙・曖昧さの回避を心がけてください。出力は書き直した本文のみ。"
            ),
        },
        "en": {
            "translate": lambda tgt: (
                f"You are a precise translator. Translate only the Answer into {tgt}. "
                "Do not use the Question to add or infer content. No notes or explanations. "
                "Preserve facts, entities, numbers, and conditions. Output only the translation."
            ),
            "summarize": (
                "You are an extractive summarizer. Summarize only the Answer, in the same language as the Answer. "
                "Do not add new facts/interpretations; do not use the Question to add content. "
                "Keep key entities, numbers, and conditions; omit rather than guess. Output summary only."
            ),
            "simplify": (
                "You are a careful rewriter. Rewrite only the Answer to be easier to understand, in the same language as the Answer. "
                "Do not add/remove/alter facts; do not use the Question to add content. Keep important details, use short sentences and plain words. Output only the rewritten text."
            ),
        },
        "vi": {
            "translate": lambda tgt: (
                f"Bạn là người dịch chính xác. Chỉ dịch phần Trả lời (Answer) sang {tgt}. "
                "Không dùng Câu hỏi (Question) để thêm/suy đoán nội dung. Không ghi chú/giải thích. "
                "Giữ nguyên sự thật, tên riêng, số liệu và điều kiện. Chỉ xuất bản dịch."
            ),
            "summarize": (
                "Bạn là người tóm tắt trích xuất. Chỉ tóm tắt phần Answer bằng cùng ngôn ngữ. "
                "Không thêm sự thật/diễn giải; không dùng Question để bổ sung nội dung. "
                "Giữ thực thể, số liệu, điều kiện quan trọng; nếu không chắc, hãy lược bỏ. Chỉ xuất bản tóm tắt."
            ),
            "simplify": (
                "Bạn là người biên soạn cẩn thận. Chỉ viết lại phần Answer cho dễ hiểu hơn, cùng ngôn ngữ. "
                "Không thêm/bớt/thay đổi sự thật; không dùng Question để bổ sung. Giữ chi tiết quan trọng, câu ngắn, từ ngữ đơn giản. Chỉ xuất bản văn bản đã viết lại."
            ),
        },
        "zh": {
            "translate": lambda tgt: (
                f"你是一名严谨的翻译。只将『答案(Answer)』翻译成 {tgt}。"
                "不要根据『问题(Question)』补充或推断内容。不要添加注释或说明。"
                "保留事实、实体、数字和条件。仅输出翻译后的答案。"
            ),
            "summarize": (
                "你是一名抽取式摘要者。仅对『答案(Answer)』进行摘要，并保持与答案相同的语言。"
                "不要新增事实/解释，也不要根据『问题(Question)』添加内容。"
                "保留关键实体、数字、条件；不确定就省略，不要猜测。仅输出摘要。"
            ),
            "simplify": (
                "你是一名仔细的改写者。仅将『答案(Answer)』改写得更易懂，并保持与答案相同的语言。"
                "不要添加/删除/更改事实；不要根据『问题(Question)』补充内容。保留重要细节，使用短句与浅显词语。仅输出改写后的文本。"
            ),
        },
        "ko": {
            "translate": lambda tgt: (
                f"당신은 엄밀한 번역가입니다. 아래 ‘답변(Answer)’만 {tgt}(으)로 번역하세요. "
                "‘질문(Question)’을 근거로 내용을 보태거나 추측하지 마세요. 주석/설명 없이, 사실/고유명사/숫자/조건을 그대로 유지하고 번역만 출력하세요."
            ),
            "summarize": (
                "당신은 추출형 요약가입니다. ‘답변(Answer)’만 같은 언어로 요약하세요. "
                "새로운 사실/해석/추측을 추가하지 말고, ‘질문(Question)’을 근거로 내용을 보태지 마세요. 중요한 고유명사/숫자/조건을 유지하고, 불확실하면 추측하지 말고 생략하세요. 결과는 요약만 출력하세요."
            ),
            "simplify": (
                "당신은 신중한 리라이터입니다. ‘답변(Answer)’만 의미를 바꾸지 않고 같은 언어로 쉽게 풀어 쓰세요. "
                "사실의 추가/삭제/변경 금지, ‘질문(Question)’을 이용한 보충 금지. 중요한 정보는 유지하고, 짧은 문장과 쉬운 단어를 사용하세요. 결과는 수정된 본문만 출력하세요."
            ),
        },
        "pt": {
            "translate": lambda tgt: (
                f"Você é um tradutor preciso. Traduza apenas a Resposta (Answer) para {tgt}. "
                "Não use a Pergunta (Question) para adicionar ou inferir conteúdo. Sem notas ou explicações. "
                "Mantenha fatos, entidades, números e condições. Saída somente a tradução."
            ),
            "summarize": (
                "Você é um resumidor extrativo. Resuma apenas a Resposta, no mesmo idioma da Resposta. "
                "Não adicione novos fatos/interpretações; não use a Pergunta para acrescentar conteúdo. "
                "Mantenha entidades, números e condições-chave; em caso de dúvida, omita. Saída apenas o resumo."
            ),
            "simplify": (
                "Você é um reescritor cuidadoso. Reescreva apenas a Resposta para ficar mais fácil de entender, no mesmo idioma. "
                "Não adicionar/remover/alterar fatos; não use a Pergunta para acrescentar conteúdo. "
                "Mantenha detalhes importantes, use frases curtas e palavras simples. Saída apenas o texto reescrito."
            ),
        },
        "es": {
            "translate": lambda tgt: (
                f"Eres un traductor preciso. Traduce solo la Respuesta (Answer) al {tgt}. "
                "No uses la Pregunta (Question) para añadir o inferir contenido. Sin notas ni explicaciones. "
                "Conserva hechos, entidades, números y condiciones. Produce únicamente la traducción."
            ),
            "summarize": (
                "Eres un resumidor extractivo. Resume solo la Respuesta, en el mismo idioma de la Respuesta. "
                "No agregues hechos/interpretaciones nuevas; no uses la Pregunta para añadir contenido. "
                "Mantén entidades, números y condiciones clave; si hay dudas, omite en lugar de adivinar. Salida: solo el resumen."
            ),
            "simplify": (
                "Eres un redactor cuidadoso. Reescribe solo la Respuesta para que sea más fácil de entender, en el mismo idioma. "
                "No añadas/elimines/modifiques hechos; no uses la Pregunta para añadir contenido. "
                "Mantén los detalles importantes, usa oraciones cortas y palabras sencillas. Salida: solo el texto reescrito."
            ),
        },
        "tl": {
            "translate": lambda tgt: (
                f"Ikaw ay isang tumpak na tagasalin. Isalin lamang ang Sagot (Answer) sa {tgt}. "
                "Huwag gamitin ang Tanong (Question) para magdagdag o manghula ng nilalaman. Walang tala o paliwanag. "
                "Panatilihin ang mga katotohanan, entidad, numero, at mga kondisyon. Ilabas lamang ang salin."
            ),
            "summarize": (
                "Ikaw ay isang extractive na tagabuod. Ibuod lamang ang Sagot, sa parehong wika ng Sagot. "
                "Huwag magdagdag ng bagong katotohanan/paliwanag; huwag gamitin ang Tanong para magdagdag ng nilalaman. "
                "Panatilihin ang mahahalagang entidad, numero, at kondisyon; kung hindi tiyak, huwag manghula—laktawan. Ilabas lamang ang buod."
            ),
            "simplify": (
                "Ikaw ay isang maingat na manunulat muli. Isulat muli lamang ang Sagot upang mas madaling maunawaan, sa parehong wika. "
                "Huwag magdagdag/magbawas/magbago ng mga katotohanan; huwag gamitin ang Tanong para magdagdag ng nilalaman. "
                "Panatilihin ang mahahalagang detalye, gumamit ng maiikling pangungusap at payak na salita. Ilabas lamang ang binagong teksto."
            ),
        },
        "id": {
            "translate": lambda tgt: (
                f"Anda adalah penerjemah yang presisi. Terjemahkan hanya Jawaban (Answer) ke {tgt}. "
                "Jangan gunakan Pertanyaan (Question) untuk menambah atau menebak isi. Tanpa catatan atau penjelasan. "
                "Pertahankan fakta, entitas, angka, dan kondisi. Keluarkan hanya terjemahannya."
            ),
            "summarize": (
                "Anda adalah peringkas ekstraktif. Ringkas hanya Jawaban, dalam bahasa yang sama dengan Jawaban. "
                "Jangan menambah fakta/interpretasi baru; jangan gunakan Pertanyaan untuk menambah konten. "
                "Pertahankan entitas, angka, dan kondisi kunci; jika ragu, hilangkan, jangan menebak. Keluarkan hanya ringkasan."
            ),
            "simplify": (
                "Anda adalah penulis ulang yang cermat. Tulis ulang hanya Jawaban agar lebih mudah dipahami, dalam bahasa yang sama. "
                "Jangan menambah/menghapus/mengubah fakta; jangan gunakan Pertanyaan untuk menambah konten. "
                "Pertahankan detail penting, gunakan kalimat pendek dan kata sederhana. Keluarkan hanya teks yang telah ditulis ulang."
            ),
        },
    }

    lang = ui_lang if ui_lang in prompts else "en"
    if action == "translate":
        tgt = target_lang or ("ja" if lang == "ja" else "en")
        f = prompts[lang]["translate"]
        return f(tgt) if callable(f) else str(f)
    return str(prompts[lang].get(action, prompts["en"]["simplify"]))


def _build_human(question: str, answer: str, ui_lang: str) -> str:
    labels = {
        "ja": ("文脈（Question：追加禁止）", "対象（Answer：この本文のみ処理）"),
        "en": ("Context Question (do NOT add content)", "Answer (the ONLY text to operate on)"),
        "vi": ("Ngữ cảnh (Question: KHÔNG bổ sung)", "Answer (CHỈ văn bản cần xử lý)"),
        "zh": ("上下文问题（不得据此添加内容）", "答案（唯一需要处理的文本）"),
        "ko": ("문맥 질문(추가 금지)", "답변(처리 대상 유일 텍스트)"),
        "pt": ("Contexto (Pergunta: NÃO adicionar)", "Resposta (o ÚNICO texto a processar)"),
        "es": ("Contexto (Pregunta: NO añadir)", "Respuesta (el ÚNICO texto a procesar)"),
        "tl": ("Konteksto (Tanong: HUWAG magdagdag)", "Sagot (tanging tekstong ipoproseso)"),
        "id": ("Konteks (Pertanyaan: JANGAN menambah)", "Jawaban (TEKS satu-satunya untuk diproses)"),
    }
    lang = ui_lang if ui_lang in labels else "en"
    ql, al = labels[lang]
    return f"{ql}:\n{question}\n\n{al}:\n{answer}"


@router.post("/apply")
def apply_action(payload: ActionPayload, current_user: dict = Depends(current_user_info)):
    # Determine UI language from user profile
    ui_label = current_user.get("spoken_language") or "English"
    ui_lang = _LABEL_TO_CODE.get(ui_label, "en")

    # Build contextual input from latest Q/A
    question = (payload.question or "").strip() if isinstance(payload.question, str) else ""
    answer = (payload.answer or "").strip() if isinstance(payload.answer, str) else ""
    fallback = (payload.text or "").strip() if isinstance(payload.text, str) else ""

    if not answer and not fallback:
        raise HTTPException(status_code=400, detail="answer or text is required")

    if answer:
        # Provide localized labels; Answer is the only target
        human = _build_human(question, answer, ui_lang)
    else:
        human = fallback

    # Choose a lightweight, separate model from RAG generation
    llm = ChatOpenAI(model="gpt-4.1-nano", temperature=0.2)
    sys = _build_system_prompt(payload.action, payload.target_lang, ui_lang)

    try:
        resp = llm.invoke([SystemMessage(content=sys), HumanMessage(content=human)])
        result = (resp.content or "").strip()
        # If simplify produced an output identical to the input answer, retry with a stronger instruction
        if payload.action == "simplify" and answer and result.strip() == answer.strip():
            sys2 = sys + (
                "\n\nIf the output is identical to the input, produce a simpler version: "
                "shorten sentences, use more common words, and preserve meaning. Output only the rewritten Answer."
            )
            try:
                resp2 = llm.invoke([SystemMessage(content=sys2), HumanMessage(content=human)])
                result2 = (resp2.content or "").strip()
                if result2 and result2 != result:
                    result = result2
            except Exception:
                # Ignore retry errors and keep original result
                pass
        # Persist into thread history
        user_id = current_user["id"]
        assigned_thread_id = None
        ph = get_placeholder()
        with get_db_cursor() as (cur, conn):
            # Ensure thread
            if payload.thread_id is not None:
                cur.execute(f"SELECT id, user_id FROM threads WHERE id = {ph}", (payload.thread_id,))
                row = cur.fetchone()
                if row:
                        if int(row['user_id']) == int(user_id):
                            assigned_thread_id = int(row['id'])

            if assigned_thread_id is None:
                cur.execute(
                    f"INSERT INTO threads (user_id, last_updated) VALUES ({ph}, {ph})",
                    (user_id, datetime.now()),
                )
                assigned_thread_id = cur.lastrowid

            # Ensure columns exist: rag_qa, type
            try:
                    # Check if columns exist in MySQL
                    cur.execute("""
                        SELECT COUNT(*) FROM information_schema.COLUMNS 
                        WHERE TABLE_SCHEMA = DATABASE() 
                        AND TABLE_NAME = 'thread_qa' 
                        AND COLUMN_NAME = 'rag_qa'
                    """)
                    if cur.fetchone()[0] == 0:
                        cur.execute("ALTER TABLE thread_qa ADD COLUMN rag_qa TEXT")
                    cur.execute("""
                        SELECT COUNT(*) FROM information_schema.COLUMNS 
                        WHERE TABLE_SCHEMA = DATABASE() 
                        AND TABLE_NAME = 'thread_qa' 
                        AND COLUMN_NAME = 'type'
                    """)
                    if cur.fetchone()[0] == 0:
                        cur.execute("ALTER TABLE thread_qa ADD COLUMN type TEXT")
                    conn.commit()
            except Exception:
                pass

            q_text = (payload.action_label or f"Action: {payload.action}").strip()
            try:
                cur.execute(
                    f"""
                    INSERT INTO thread_qa (thread_id, question, answer, rag_qa, type)
                    VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
                    """,
                    (assigned_thread_id, q_text, result, "[]", "action"),
                )
            except Exception:
                cur.execute(
                    f"INSERT INTO thread_qa (thread_id, question, answer) VALUES ({ph}, {ph}, {ph})",
                    (assigned_thread_id, q_text, result),
                )
            cur.execute(
                f"UPDATE threads SET last_updated = {ph} WHERE id = {ph}",
                (datetime.now(), assigned_thread_id),
            )
            conn.commit()

        return {"result": result, "thread_id": assigned_thread_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Action failed: {str(e)}")

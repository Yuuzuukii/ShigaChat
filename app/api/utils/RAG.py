import os
import sqlite3
import pickle
from pathlib import Path
from collections import defaultdict
from typing import Optional, Iterable, Union, List, Dict
import dotenv
import numpy as np
import faiss
from tqdm import tqdm
from config import DATABASE
from openai import OpenAI
from langchain_community.chat_models import ChatOpenAI
from langchain.schema import HumanMessage
from lingua import Language, LanguageDetectorBuilder

class LanguageDetectionError(ValueError):
    """言語を特定できなかった（短文/ノイズなど）"""


class UnsupportedLanguageError(ValueError):
    """対応外の言語が検出された（許可: JA/EN/VI/ZH/KO）"""

dotenv.load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

VECTOR_DIR = Path("./api/utils/vectors")
VECTOR_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_ISO = {"ja", "en", "vi", "zh", "ko"}

def get_language_map() -> Dict[int, str]:
    """languageテーブルから {id: code(lower)} を取得"""
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()
    cur.execute("SELECT id, code FROM language")
    rows = cur.fetchall()
    conn.close()
    return {row[0]: row[1].lower() for row in rows}

_LINGUA_ALL = (
    LanguageDetectorBuilder
    .from_all_languages()
    .with_preloaded_language_models()
    .build()
)
def detect_lang(text: str) -> str:
    lang = _LINGUA_ALL.detect_language_of(text)
    if lang is None or lang.iso_code_639_1 is None:
        raise LanguageDetectionError("言語を特定できませんでした。")
    iso = lang.iso_code_639_1.name.lower()

    # zh-cn, zh-tw を zh に寄せる
    if iso.startswith("zh"):
        iso = "zh"
    if iso == "jp":
        iso = "ja"

    if iso not in ALLOWED_ISO:
        raise UnsupportedLanguageError(f"未対応の言語が検出されました: {iso}")

    return iso

def get_embedding(text: str):
    try:
        resp = client.embeddings.create(input=[text], model="text-embedding-3-small")
    except Exception as e:  # 必要なら型を絞る
        raise RuntimeError(f"Embedding取得に失敗: {e}") from e
    return resp.data[0].embedding

# ベクトル生成＆保存
def generate_and_save_vectors():
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()

    print("ベクトル生成開始...")
    cur.execute("SELECT id, question_id, answer_id FROM QA")
    qa_rows = cur.fetchall()
    print(f"総QA数: {len(qa_rows)} 件")

    LANGUAGE_MAP = get_language_map()  # {id:'ja', ...}
    print(f"対応言語: {list(set(LANGUAGE_MAP.values()))}")

    lang_text_map: Dict[str, list] = defaultdict(list)

    for qa_id, qid, aid in tqdm(qa_rows, desc="ベクトル生成中"):
        for lang_id, lang_code in LANGUAGE_MAP.items():
            cur.execute(
                "SELECT texts FROM question_translation WHERE question_id=? AND language_id=?",
                (qid, lang_id)
            )
            qrow = cur.fetchone()

            cur.execute(
                "SELECT texts FROM answer_translation WHERE answer_id=? AND language_id=?",
                (aid, lang_id)
            )
            arow = cur.fetchone()

            cur.execute("SELECT time FROM question WHERE question_id=?", (qid,))
            trow = cur.fetchone()

            if qrow and arow and trow:
                question_text = qrow[0]
                answer_text = arow[0]
                time_val = trow[0]
                text = f"Q: {question_text}\nA: {answer_text}"
                embedding = get_embedding(text)
                lang_text_map[lang_code].append(
                    (embedding, (qa_id, qid), (question_text, answer_text, time_val))
                )

    # 言語ごとにFAISSへ投入して保存
    for lang_code, data in lang_text_map.items():
        if not data:
            print(f"{lang_code} のデータが空なのでスキップ")
            continue

        vectors = np.array([x[0] for x in data]).astype("float32")
        faiss.normalize_L2(vectors)
        meta = [x[1] for x in data]
        texts = [x[2] for x in data]

        index = faiss.IndexFlatIP(vectors.shape[1])
        index.add(vectors)

        faiss.write_index(index, str(VECTOR_DIR / f"vectors_{lang_code}.faiss"))
        with open(VECTOR_DIR / f"vectors_{lang_code}.meta.pkl", "wb") as f:
            pickle.dump(meta, f)
        with open(VECTOR_DIR / f"vectors_{lang_code}.texts.pkl", "wb") as f:
            pickle.dump(texts, f)

        print(f"保存完了: vectors_{lang_code}.*（{len(data)} 件）")

    conn.close()
    print("全ベクトル保存完了")

# RAG検索（ここで言語例外を投げる）
def rag(question: str) -> Dict[int, List[Union[str, float]]]:
    """
    言語検出に失敗/未対応の場合は例外を投げる
    成功時は rank-> [answer, question, time, similarity] を返す。
    """
    # 言語検出（Linguaのみ、未対応/検出不可は例外）
    lang = detect_lang(question)  # 'ja' / 'en' / 'vi' / 'zh' / 'ko'
    print(f"検出言語: {lang}")

    base_path = VECTOR_DIR / f"vectors_{lang}"
    faiss_path = base_path.with_suffix(".faiss")
    meta_path = base_path.with_suffix(".meta.pkl")
    texts_path = base_path.with_suffix(".texts.pkl")

    if not faiss_path.exists():
        print(f"{faiss_path} が存在しません → 生成を試みます")
        generate_and_save_vectors()

    if not faiss_path.exists():
        # インデックス未生成などの運用エラーは 500 に寄せたいのでここでは例外を投げず上位で処理
        raise RuntimeError(f"ベクトルが見つかりません: {faiss_path}")

    index = faiss.read_index(str(faiss_path))
    with open(meta_path, "rb") as f:
        meta = pickle.load(f)
    with open(texts_path, "rb") as f:
        texts = pickle.load(f)

    query_vec = np.array(get_embedding(question)).astype("float32").reshape(1, -1)
    faiss.normalize_L2(query_vec)
    D, I = index.search(query_vec, 5)

    results: Dict[int, List[Union[str, float]]] = {}
    ranked = sorted(zip(I[0], D[0]), key=lambda x: x[1], reverse=True)
    for rank, (idx, similarity) in enumerate(ranked):
        question_text, answer_text, time_val = texts[idx]
        results[rank + 1] = [answer_text, question_text, time_val, float(similarity)]
    return results

# LLMによる回答生成
def _build_prompt_ja(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = "あなたは滋賀県に住む外国人に情報を提供する専門家です。\n"
    prompt += "以下は参考情報です:\n\n"
    prompt += "【RAGから抽出されたQA】\n"
    for i, qa in enumerate(rag_qa, 1):
        prompt += f"Q{i}: {qa['question']}\nA{i}: {qa['answer']}\n"
    prompt += "\n【これまでの会話履歴】\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"User{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n【現在の質問】\n{question_text}\n"
    prompt += "\n上記の参考情報と会話履歴を踏まえて、簡潔かつ正確に回答してください。"
    return prompt

def _build_prompt_en(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = "You are a local information specialist for foreigners living in Shiga Prefecture.\n"
    prompt += "Use the following as reference information:\n\n"
    prompt += "[RAG Retrieved Q&A]\n"
    for i, qa in enumerate(rag_qa, 1):
        prompt += f"Q{i}: {qa['question']}\nA{i}: {qa['answer']}\n"
    prompt += "\n[Conversation History]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"User{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n[Current Question]\n{question_text}\n"
    prompt += "\nPlease answer concisely and accurately in English, using the references and history."
    return prompt

def _build_prompt_vi(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = "Bạn là chuyên gia cung cấp thông tin địa phương cho người nước ngoài sống tại tỉnh Shiga.\n"
    prompt += "Hãy sử dụng các thông tin tham khảo sau:\n\n"
    prompt += "[Q&A được truy xuất từ RAG]\n"
    for i, qa in enumerate(rag_qa, 1):
        prompt += f"H{i}: {qa['question']}\nĐ{i}: {qa['answer']}\n"
    prompt += "\n[Lịch sử hội thoại]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"Người dùng{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n[Câu hỏi hiện tại]\n{question_text}\n"
    prompt += "\nVui lòng trả lời ngắn gọn và chính xác bằng tiếng Việt, dựa trên thông tin tham khảo và lịch sử."
    return prompt

def _build_prompt_zh(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = "你是一位为居住在滋贺县的外国人提供信息的本地专家。\n"
    prompt += "请参考以下信息：\n\n"
    prompt += "【RAG 检索到的问答】\n"
    for i, qa in enumerate(rag_qa, 1):
        prompt += f"问{i}: {qa['question']}\n答{i}: {qa['answer']}\n"
    prompt += "\n【对话历史】\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"用户{i}: {q}\n机器人{i}: {a}\n"
    prompt += f"\n【当前问题】\n{question_text}\n"
    prompt += "\n请基于以上参考信息和对话历史，用简体中文简洁且准确地作答。"
    return prompt

def _build_prompt_ko(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = "당신은 시가현에 거주하는 외국인을 위해 정보를 제공하는 지역 전문가입니다.\n"
    prompt += "다음 정보를 참고하세요:\n\n"
    prompt += "[RAG로 검색된 Q&A]\n"
    for i, qa in enumerate(rag_qa, 1):
        prompt += f"문{i}: {qa['question']}\n답{i}: {qa['answer']}\n"
    prompt += "\n[대화 기록]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"사용자{i}: {q}\n봇{i}: {a}\n"
    prompt += f"\n[현재 질문]\n{question_text}\n"
    prompt += "\n위의 참고 정보와 대화 기록을 바탕으로, 한국어로 간결하고 정확하게 답변하세요."
    return prompt

# 検出言語ごとのビルダーマップ
_PROMPT_BUILDERS = {
    "ja": _build_prompt_ja,
    "en": _build_prompt_en,
    "vi": _build_prompt_vi,
    "zh": _build_prompt_zh,
    "ko": _build_prompt_ko,
}

def generate_answer_with_llm(question_text: str, rag_qa: list, history_qa: list) -> str:
    """
    検出言語に合わせてプロンプトを切り替え、LLMへ投げる。
    ※ rag() 側でも言語検出・検証は済んでいるが、ここでも再判定して出力言語を確実化する。
    """
    # 言語判定（未対応/検出不可は上位へ例外伝播）
    lang = detect_lang(question_text)  # 'ja'|'en'|'vi'|'zh'|'ko'

    # ビルダー取得（理論上必ず存在するはずだが保険）
    builder = _PROMPT_BUILDERS.get(lang)
    if builder is None:
        raise UnsupportedLanguageError(f"未対応の言語が検出されました: {lang}")

    prompt = builder(question_text, rag_qa, history_qa)

    llm = ChatOpenAI(model="gpt-4.1-nano", temperature=0.3)
    response = llm.invoke([HumanMessage(content=prompt)])
    return response.content.strip()
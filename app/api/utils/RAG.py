import sqlite3
import pickle
from langdetect import detect
from openai import OpenAI
import faiss
import numpy as np
from collections import defaultdict
import dotenv
import os
from tqdm import tqdm
from langchain.chat_models import ChatOpenAI
from langchain.schema import HumanMessage
from pathlib import Path
from config import DATABASE  # ✅ config.py から正しいDBパスを取得

dotenv.load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

VECTOR_DIR = Path("./api/utils/vectors")
VECTOR_DIR.mkdir(parents=True, exist_ok=True)  # ディレクトリが無ければ作成

# 言語ID → 言語コードのマッピングをDBから取得
def get_language_map():
    conn = sqlite3.connect(DATABASE)  # ✅ 修正
    cur = conn.cursor()
    cur.execute("SELECT id, code FROM language")
    rows = cur.fetchall()
    conn.close()
    return {row[0]: row[1].lower() for row in rows}
# OpenAIベクトル取得
def get_embedding(text):
    response = client.embeddings.create(
        input=[text],
        model="text-embedding-3-small"
    )
    return response.data[0].embedding
# ベクトル生成＆保存
def generate_and_save_vectors():
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()
    print("ベクトル生成開始...")
    # QAペアを取得
    cur.execute("SELECT id, question_id, answer_id FROM QA")
    qa_rows = cur.fetchall()
    print(f"総QA数: {len(qa_rows)} 件")
    LANGUAGE_MAP = get_language_map()
    print(f"対応言語: {list(LANGUAGE_MAP.values())}")
    lang_text_map = defaultdict(list)
    for qa_id, qid, aid in tqdm(qa_rows, desc="ベクトル生成中"):
        for lang_id, lang_code in LANGUAGE_MAP.items():
            cur.execute("SELECT texts FROM question_translation WHERE question_id=? AND language_id=?", (qid, lang_id))
            qrow = cur.fetchone()
            cur.execute("SELECT texts FROM answer_translation WHERE answer_id=? AND language_id=?", (aid, lang_id))
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
        # 保存
        faiss.write_index(index, str(VECTOR_DIR / f"vectors_{lang_code}.faiss"))
        with open(VECTOR_DIR / f"vectors_{lang_code}.meta.pkl", "wb") as f:
            pickle.dump(meta, f)
        with open(VECTOR_DIR / f"vectors_{lang_code}.texts.pkl", "wb") as f:
            pickle.dump(texts, f)
        print(f"保存完了: vectors_{lang_code}.*（{len(data)} 件）")
    conn.close()
    print("全ベクトル保存完了")
# RAG検索
def rag(question):
    lang = detect(question)
    print(f"検出言語: {lang}")
    base_path = VECTOR_DIR / f"vectors_{lang}"
    faiss_path = base_path.with_suffix(".faiss")
    meta_path = base_path.with_suffix(".meta.pkl")
    texts_path = base_path.with_suffix(".texts.pkl")
    if not faiss_path.exists():
        print(f"{faiss_path} が存在しません → 生成を試みます")
        generate_and_save_vectors()
    if not faiss_path.exists():
        raise Exception(f"ベクトルが見つかりません: {faiss_path}")
    index = faiss.read_index(str(faiss_path))
    with open(meta_path, "rb") as f:
        meta = pickle.load(f)
    with open(texts_path, "rb") as f:
        texts = pickle.load(f)
    query_vec = np.array(get_embedding(question)).astype("float32").reshape(1, -1)
    faiss.normalize_L2(query_vec)
    D, I = index.search(query_vec, 5)
    results = {}
    ranked = sorted(zip(I[0], D[0]), key=lambda x: x[1], reverse=True)
    for rank, (idx, similarity) in enumerate(ranked):
        question_text, answer_text, time_val = texts[idx]
        results[rank + 1] = [answer_text, question_text, time_val, similarity]
    return results
# LLMによる回答生成
def generate_answer_with_llm(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = "あなたは滋賀県に住む外国人に情報を提供する専門家です。\n"
    prompt += "以下は参考情報です:\n\n"

    # RAGからの関連QA
    prompt += "【RAGから抽出されたQA】\n"
    for i, qa in enumerate(rag_qa, 1):
        prompt += f"Q{i}: {qa['question']}\nA{i}: {qa['answer']}\n"

    # 過去の会話履歴
    prompt += "\n【これまでの会話履歴】\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"User{i}: {q}\nBot{i}: {a}\n"

    # 現在の質問
    prompt += f"\n【現在の質問】\n{question_text}\n"
    prompt += "\nこの質問に対して、参考情報と会話履歴を踏まえて適切に回答してください。"

    llm = ChatOpenAI(model="gpt-4.1-nano", temperature=0.3)
    response = llm.invoke([HumanMessage(content=prompt)])
    return response.content.strip()

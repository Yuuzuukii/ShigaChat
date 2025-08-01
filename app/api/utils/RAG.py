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
dotenv.load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)
DB_PATH = "../../ShigaChat.db"  # SQLiteファイル名
# 言語ID → 言語コードのマッピングをDBから取得
def get_language_map():
    conn = sqlite3.connect(DB_PATH)
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
# 1. ベクトル事前作成フェーズ
def generate_and_save_vectors():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    print("ベクトル生成開始...")
    # 全QAペアを取得
    cur.execute("SELECT id, question_id, answer_id FROM QA")
    qa_rows = cur.fetchall()
    print(f"総QA数: {len(qa_rows)} 件")
    LANGUAGE_MAP = get_language_map()
    print(f"対応言語: {list(LANGUAGE_MAP.values())}")
    lang_text_map = defaultdict(list)  # 言語ごとの [(embedding, meta, text)] 格納
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
        meta = [x[1] for x in data]   # (qa_id, question_id)
        texts = [x[2] for x in data]  # (question_text, answer_text, time)
        index = faiss.IndexFlatL2(vectors.shape[1])
        index.add(vectors)
        VEC_DIR = os.path.dirname(os.path.abspath(DB_PATH))
        vec_file = os.path.join(VEC_DIR, f"vectors_{lang_code}.pkl")
        with open(vec_file, "wb") as f:
            pickle.dump((index, meta, texts), f)
        print(f"保存完了: {vec_file}（{len(data)} 件）")
    conn.close()
    print(":チェックマーク_緑: 全ベクトル保存完了")
# 2. RAG検索関数（DB参照なし）
def rag(question):
    lang = detect(question)
    print(f"検出言語: {lang}")
    vec_path = f"../../vectors_{lang}.pkl"
    if not os.path.exists(vec_path):
        print(f":小包み: ベクトルファイルが見つかりません: {vec_path} → 生成を試みます")
        generate_and_save_vectors()
    if not os.path.exists(vec_path):
        raise Exception(f":x: ベクトルが見つかりません（生成にも失敗）: {vec_path}")
    with open(vec_path, "rb") as f:
        index, meta, texts = pickle.load(f)
    query_vec = np.array(get_embedding(question)).astype("float32").reshape(1, -1)
    D, I = index.search(query_vec, 5)
    results = {}
    for rank, idx in enumerate(I[0]):
        question_text, answer_text, time_val = texts[idx]
        results[rank + 1] = [answer_text, question_text, time_val]
    return results
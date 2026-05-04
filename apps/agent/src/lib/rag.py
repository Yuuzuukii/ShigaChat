import os
from dotenv import load_dotenv
from openai import OpenAI
from src.lib.config import DB_CONFIG
from src.lib.language import LANGUAGE_MAP, resolve_language
from src.schema.outputs import RefQA, RefQAItem

load_dotenv()

# 質問文をベクトル化
def embed_text(text):
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    resp = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return resp.data[0].embedding

# ベクトル検索
def vector_search(question: str, language: str, top_k: int) -> RefQA:
    import psycopg

    lang_id = LANGUAGE_MAP[resolve_language(language)]
    q_vector = embed_text(question)
    conn = psycopg.connect(**DB_CONFIG)
    cur = conn.cursor()
    # qa_embedding, それぞれのテーブルから
    cur.execute(f"""
        SELECT qq.question_id, qq.category_id, q.texts, a.texts
        FROM qa_embedding e 
                JOIN question qq ON qq.question_id = e.question_id
                JOIN question_translation q ON q.question_id = e.question_id AND q.language_id = e.language_id
                JOIN answer_translation a ON a.answer_id = e.answer_id AND a.language_id = e.language_id
        WHERE e.language_id = %s
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (lang_id, q_vector, top_k))

    refs = []

    for r in cur.fetchall():
        refs.append(
            RefQAItem(
                question_id=r[0],
                category_id=r[1],
                question=r[2],
                answer=r[3],
            )
        )

    cur.close()
    conn.close()

    return RefQA(
        ref_qa = refs
    )

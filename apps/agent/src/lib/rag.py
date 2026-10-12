import os
from dotenv import load_dotenv
from openai import AsyncOpenAI
import psycopg
from lib.config import DB_CONFIG
from lib.language import LANGUAGE_MAP, resolve_language
from schema.outputs import RefQA, RefQAItem

load_dotenv()

# リクエストごとに作り直さず、プロセス内で1つを使い回す（httpxの接続プールを再利用できる）
_openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 質問文をベクトル化
async def embed_text(text):
    resp = await _openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return resp.data[0].embedding

# ベクトル検索
async def vector_search(question: str, language: str, top_k: int) -> RefQA:
    lang_id = LANGUAGE_MAP[resolve_language(language)]
    q_vector = await embed_text(question)

    # 待っている間は他のリクエストを処理できるよう、非同期接続を使う
    async with await psycopg.AsyncConnection.connect(**DB_CONFIG) as conn:
        async with conn.cursor() as cur:
            # qa_embedding, それぞれのテーブルから
            await cur.execute("""
                SELECT qq.question_id, qq.category_id, q.texts, a.texts
                FROM qa_embedding e
                        JOIN question qq ON qq.question_id = e.question_id
                        JOIN question_translation q ON q.question_id = e.question_id AND q.language_id = e.language_id
                        JOIN answer_translation a ON a.answer_id = e.answer_id AND a.language_id = e.language_id
                WHERE e.language_id = %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """, (lang_id, q_vector, top_k))
            rows = await cur.fetchall()

    refs = [
        RefQAItem(
            question_id=r[0],
            category_id=r[1],
            question=r[2],
            answer=r[3],
        )
        for r in rows
    ]

    return RefQA(
        ref_qa = refs
    )

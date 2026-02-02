"""
簡易RAGパイプライン: pgvectorから類似コンテキストを取得し、LLMに投げて回答を生成するスクリプト。
"""

import os
import json
from typing import List

from api.rag.search import retrieve, SearchResult
from api.rag.prompt_builder import build_prompt
from api.rag.generator import generate_answer, strip_citations


# 質問文を受け取り、検索→プロンプト生成→LLM呼び出し→結果JSONを返す
def run_rag_query(
    question: str,
    *,
    language_id: int = 1,
    lang_code: str = "ja",
    top_k: int = 5,
    similarity_threshold: float = 0.3,
    model: str = None,
) -> dict:
    model = model or os.getenv("LLM_MODEL", "gpt-5-nano")

    # 検索
    contexts = retrieve(
        question,
        language_id=language_id,
        top_k=top_k,
        similarity_threshold=similarity_threshold,
    )

    # SearchResult -> dict に整形し sid を付与
    ctx_list = []
    for i, c in enumerate(contexts, 1):
        ctx_list.append(
            {
                "sid": f"S{i}",
                "question": c.question_text,
                "answer": c.answer_text,
            }
        )

    prompt = build_prompt(question, ctx_list, lang=lang_code)

    # LLM呼び出し
    answer_text, used_model = generate_answer(prompt, model=model)
    clean_answer = strip_citations(answer_text)

    return {
        "question": question,
        "prompt": prompt,
        "answer": clean_answer,
        "contexts": ctx_list,
        "model": used_model,
    }


if __name__ == "__main__":
    import sys

    # コマンドライン引数から質問文を受け取る（無ければデフォルト）
    question = sys.argv[1] if len(sys.argv) > 1 else "琵琶湖を一周したい"

    result = run_rag_query(question)
    print(json.dumps(result, ensure_ascii=False, indent=2))

from __future__ import annotations

import os
from dotenv import load_dotenv
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from schema.dto import State, Context
from schema.outputs import RefQA, RefSelection
from lib.llm import call_llm, call_llm_structured
from lib.language import detect_language, resolve_language
from lib.rag import vector_search
from lib.prompts import QUERY_REWRITE, SELECT_REF, ANSWER_WITH_REF, ANSWER_WITHOUT_REF
from agent.routing import route_after_vector_search, route_after_select_ref

load_dotenv()

QUERY_REWRITE_MODEL = os.getenv("QUERY_REWRITE_MODEL", "gpt-5.4-nano")
REF_SELECTION_MODEL = os.getenv("REF_SELECTION_MODEL", "gpt-5.4-nano")


def _format_ref_qa(ref_items: list, *, include_ids: bool) -> str:
    blocks: list[str] = []
    for index, item in enumerate(ref_items, start=1):
        lines = []
        if include_ids:
            lines.append(f"id: ref_{index}")
        lines.append(f"question: {item.question}")
        lines.append(f"answer: {item.answer}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)

# 言語判定ノード
async def lang_detect_node(state: State, runtime: Runtime[Context]) -> dict:
    question = runtime.context["question"]
    language = detect_language(question)

    return {"language": language}

# クエリ書き換えノード
async def query_rewrite_node(state: State, runtime: Runtime[Context]) -> dict:
    question = runtime.context["question"]
    chat_history_text = runtime.context["chat_history_text"]
    language = resolve_language(state.language)

    if not chat_history_text.strip():
        return {"retrieval_query": question}

    prompt = QUERY_REWRITE[language].format(
        chat_history=chat_history_text,
        question=question,
    )
    retrieval_query = await call_llm(
        prompt, 
        model=QUERY_REWRITE_MODEL, 
        reasoning={"effort": "low"}
    )

    return {"retrieval_query": retrieval_query.strip() or question}

# ベクトル検索ノード
async def vector_search_node(state: State, runtime: Runtime[Context]) -> dict:
    language = resolve_language(state.language)
    retrieval_query = state.retrieval_query or runtime.context["question"]

    ref_qa = vector_search(retrieval_query, language, 5)

    return {"ref_qa": ref_qa}

# 使用する参照QA選別ノード
async def select_ref_node(state: State, runtime: Runtime[Context]) -> dict:
    retrieval_query = state.retrieval_query or runtime.context["question"]
    language = resolve_language(state.language)
    chat_history_text = runtime.context["chat_history_text"]
    ref_items = state.ref_qa.ref_qa

    ref_qa_text = _format_ref_qa(ref_items, include_ids=True)

    prompt = SELECT_REF[language].format(
        chat_history=chat_history_text,
        question=retrieval_query,
        ref_qa=ref_qa_text,
    )

    # idのみを返す
    selection = await call_llm_structured(
        prompt,
        RefSelection,
        model=REF_SELECTION_MODEL,
        reasoning={"effort": "low"},
    )

    ref_lookup = {
        f"ref_{index}": item for index, item in enumerate(ref_items, start=1)
    }
    
    selected_ref_qa = [
        ref_lookup[ref_id]
        for ref_id in selection.selected_ids
        if ref_id in ref_lookup
    ]

    return {"ref_qa": RefQA(ref_qa=selected_ref_qa)}

# 参照QAを用いた回答プロンプト生成ノード
async def build_answer_with_ref_prompt_node(state: State, runtime: Runtime[Context]) -> dict:
    question = runtime.context["question"]
    language = resolve_language(state.language)
    chat_history_text = runtime.context["chat_history_text"]
    ref_qa_text = _format_ref_qa(state.ref_qa.ref_qa, include_ids=False)

    prompt = ANSWER_WITH_REF[language].format(
        chat_history=chat_history_text,
        question=question,
        ref_qa=ref_qa_text,
    )

    return {"answer_prompt": prompt}

# 参照QAを用いない回答プロンプト生成ノード
async def build_answer_without_ref_prompt_node(state: State, runtime: Runtime[Context]) -> dict:
    question = runtime.context["question"]
    language = resolve_language(state.language)
    chat_history_text = runtime.context["chat_history_text"]

    prompt = ANSWER_WITHOUT_REF[language].format(
        chat_history=chat_history_text,
        question=question,
    )

    return {"answer_prompt": prompt}

# Define the graph
graph = (
    StateGraph(State, context_schema=Context)
    .add_node("lang_detect_node", lang_detect_node)
    .add_node("query_rewrite_node", query_rewrite_node)
    .add_node("vector_search_node", vector_search_node)
    .add_node("select_ref_node", select_ref_node)
    .add_node("build_answer_with_ref_prompt_node", build_answer_with_ref_prompt_node)
    .add_node("build_answer_without_ref_prompt_node", build_answer_without_ref_prompt_node)

    .add_edge(START, "lang_detect_node")
    .add_edge("lang_detect_node", "query_rewrite_node")
    .add_edge("query_rewrite_node", "vector_search_node")
 
    .add_conditional_edges("vector_search_node", route_after_vector_search)
    .add_conditional_edges("select_ref_node", route_after_select_ref)

    .add_edge("build_answer_with_ref_prompt_node", END)
    .add_edge("build_answer_without_ref_prompt_node", END)

    .compile(name="ShigaChat-Graph")
)

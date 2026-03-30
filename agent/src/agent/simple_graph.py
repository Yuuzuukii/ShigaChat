from langgraph.graph import END, START, StateGraph

from agent.graph import (
    build_answer_without_ref_prompt_node,
    lang_detect_node,
    query_rewrite_node,
    vector_search_node,
)
from agent.routing import route_after_vector_search_simple
from lib.prompts import SIMPLE_ANSWER
from schema.dto import Context, State


async def build_simple_answer_prompt_node(state: State, runtime) -> dict:
    question = state.retrieval_query or runtime.context["question"]
    language = state.language
    chat_history_text = runtime.context["chat_history_text"]
    ref_qa_text = "\n\n".join(
        f"question: {item.question}\nanswer: {item.answer}"
        for item in state.ref_qa.ref_qa
    )

    prompt = SIMPLE_ANSWER[language].format(
        chat_history=chat_history_text,
        question=question,
        ref_qa=ref_qa_text,
    )

    return {"answer_prompt": prompt}


simple_graph = (
    StateGraph(State, context_schema=Context)
    .add_node("lang_detect_node", lang_detect_node)
    .add_node("query_rewrite_node", query_rewrite_node)
    .add_node("vector_search_node", vector_search_node)
    .add_node("build_simple_answer_prompt_node", build_simple_answer_prompt_node)
    .add_node(
        "build_answer_without_ref_prompt_node",
        build_answer_without_ref_prompt_node,
    )
    .add_edge(START, "lang_detect_node")
    .add_edge("lang_detect_node", "query_rewrite_node")
    .add_edge("query_rewrite_node", "vector_search_node")
    .add_conditional_edges("vector_search_node", route_after_vector_search_simple)
    .add_edge("build_simple_answer_prompt_node", END)
    .add_edge("build_answer_without_ref_prompt_node", END)
    .compile(name="ShigaChat-Simple-Graph")
)

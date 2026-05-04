import os
from dotenv import load_dotenv
from fastapi import FastAPI
import json

from pydantic import BaseModel
from fastapi.responses import StreamingResponse

from agent.graph import graph
from agent.simple_graph import simple_graph
from src.schema.dto import State
from src.schema.outputs import RefQA, SimpleAnswer
from src.lib.llm import astream_llm, call_llm, call_llm_structured

load_dotenv()

app = FastAPI()

ANSWER_MODEL = os.getenv("ANSWER_MODEL", "gpt-5.4-nano")
class ChatRequest(BaseModel):
    question: str
    thread_id: int
    chat_history_text: str = ""


class SimpleRefQAItemRequest(BaseModel):
    question: str
    answer: str


class SimpleChatRequest(BaseModel):
    question: str
    thread_id: int
    chat_history_text: str = ""
    ref_qa: list[SimpleRefQAItemRequest] = []

# フロントに逐次返すイベント
def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    async def event_generator():
        try:
            yield _sse_event("history_loaded", {}) # 進捗表示用

             # 初期値たち
            answer_prompt = ""
            selected_ref_qa = []
            language = "ja"

            # グラフのノードごとにfor文を回す
            async for update in graph.astream(
                State(),
                context={
                    "question": request.question,
                    "chat_history_text": request.chat_history_text,
                },
                stream_mode="updates",
            ):
                # 例）lang_detect_nodeが実行されたとき、検出言語を返して、関数は続行する（yield）
                if "lang_detect_node" in update:
                    language = update["lang_detect_node"]["language"]
                    # 進捗表示用
                    yield _sse_event(
                        "language_detected",
                        {"language": language},
                    )

                if "query_rewrite_node" in update:
                    yield _sse_event(
                        "query_rewritten",
                        {"retrieval_query": update["query_rewrite_node"]["retrieval_query"]},
                    )

                if "vector_search_node" in update:
                    ref_qa = update["vector_search_node"]["ref_qa"].ref_qa
                    yield _sse_event("vector_search_done", {"ref_qa_count": len(ref_qa)})

                if "select_ref_node" in update:
                    selected_ref_qa = update["select_ref_node"]["ref_qa"].ref_qa
                    yield _sse_event(
                        "reference_selected",
                        {"ref_qa_count": len(selected_ref_qa)},
                    )

                if "build_answer_with_ref_prompt_node" in update:
                    answer_prompt = update["build_answer_with_ref_prompt_node"]["answer_prompt"]
                    selected_ref_qa = update["build_answer_with_ref_prompt_node"].get(
                        "ref_qa",
                        selected_ref_qa,
                    )

                if "build_answer_without_ref_prompt_node" in update:
                    answer_prompt = update["build_answer_without_ref_prompt_node"]["answer_prompt"]

            # answer_promptを使って、回答生成を行う
            yield _sse_event("answer_start", {}) # 進捗表示用
            # astream_llmからyieldで返ってくるチャンクごとに、逐次でfor文を回す
            async for token in astream_llm(answer_prompt, model=ANSWER_MODEL):
                yield _sse_event("token", {"content": token})

            # 最後に参照QAを返す
            yield _sse_event(
                "end",
                {
                    "ref_qa": [
                        {
                            "question": item.question,
                            "answer": item.answer,
                            "question_id": item.question_id,
                            "category_id": item.category_id,
                        }
                        for item in selected_ref_qa
                    ]
                },
            )
        except Exception as exc:
            print(f"[ERROR] /chat/stream failed: {exc}")
            yield _sse_event("error", {"message": str(exc)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/chat/simple")
async def chat_simple(request: SimpleChatRequest) -> dict:
    answer_prompt = ""
    retrieval_query = request.question
    initial_ref_qa = RefQA(ref_qa=[])

    async for update in simple_graph.astream(
        State(),
        context={
            "question": request.question,
            "chat_history_text": request.chat_history_text,
        },
        stream_mode="updates",
    ):
        if "query_rewrite_node" in update:
            retrieval_query = update["query_rewrite_node"]["retrieval_query"]

        if "vector_search_node" in update:
            initial_ref_qa = update["vector_search_node"]["ref_qa"]

        if "build_simple_answer_prompt_node" in update:
            answer_prompt = update["build_simple_answer_prompt_node"]["answer_prompt"]

        if "build_answer_without_ref_prompt_node" in update:
            answer_prompt = update["build_answer_without_ref_prompt_node"]["answer_prompt"]

    if initial_ref_qa.ref_qa:
        result = await call_llm_structured(
            answer_prompt,
            SimpleAnswer,
            model=ANSWER_MODEL,
            reasoning={"effort": "low"},
        )
        answer = result.answer.strip()
        ref_items = result.ref_qa
    else:
        answer = (
            await call_llm(
                answer_prompt,
                model=ANSWER_MODEL,
                reasoning={"effort": "minimal"},
            )
        ).strip()
        ref_items = []

    ref_qa = [
        {
            "question": item.question,
            "answer": item.answer,
            "question_id": item.question_id,
            "category_id": item.category_id,
        }
        for item in ref_items
    ]
    used_source_ids = [f"S{i}" for i in range(1, len(ref_qa) + 1)]

    return {
        "answer": answer.strip(),
        "ref_qa": ref_qa,
        "meta": {
            "references": ref_qa,
            "used_source_ids": used_source_ids,
            "model_used": ANSWER_MODEL,
            "retrieval_query": retrieval_query,
        },
    }

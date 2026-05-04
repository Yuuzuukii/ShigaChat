from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from controllers.dependencies import (
    agent_client,
    chat_turn_repository,
    current_actor,
    thread_repository,
    title_generator,
    to_http_error,
)
from domain.shared.actor import Actor
from domain.shared.errors import DomainError
from infrastructure.agent.agent_client import AgentClient
from infrastructure.llm.title_generator import ThreadTitleGenerator
from repositories.conversation.chat_turn_repository import PostgresChatTurnRepository
from repositories.conversation.thread_repository import PostgresThreadRepository
from usecases.conversation.ask_question import AskQuestionUseCase
from usecases.conversation.create_thread import CreateThreadUseCase
from usecases.conversation.delete_thread import DeleteThreadUseCase
from usecases.conversation.get_thread_messages import GetThreadMessagesUseCase
from usecases.conversation.list_threads import ListThreadsUseCase
from usecases.conversation.stream_answer import StreamAnswerUseCase

router = APIRouter()


class QuestionRequest(BaseModel):
    thread_id: Optional[int] = None
    text: str
    similarity_threshold: Optional[float] = None
    model: Optional[str] = None
    reasoning_effort: Optional[str] = None


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.post("/create_thread")
async def create_thread(
    actor: Actor = Depends(current_actor),
    threads: PostgresThreadRepository = Depends(thread_repository),
):
    return CreateThreadUseCase(threads).execute(actor)


@router.get("/get_user_threads")
async def get_user_threads(
    actor: Actor = Depends(current_actor),
    threads: PostgresThreadRepository = Depends(thread_repository),
):
    return ListThreadsUseCase(threads).execute(actor)


@router.get("/get_thread_messages/{thread_id}")
async def get_thread_messages(
    thread_id: int,
    actor: Actor = Depends(current_actor),
    threads: PostgresThreadRepository = Depends(thread_repository),
    turns: PostgresChatTurnRepository = Depends(chat_turn_repository),
):
    try:
        return GetThreadMessagesUseCase(threads, turns).execute(actor, thread_id)
    except DomainError as exc:
        raise to_http_error(exc) from exc


@router.delete("/delete_thread/{thread_id}")
async def delete_thread(
    thread_id: int,
    actor: Actor = Depends(current_actor),
    threads: PostgresThreadRepository = Depends(thread_repository),
    turns: PostgresChatTurnRepository = Depends(chat_turn_repository),
):
    try:
        return DeleteThreadUseCase(threads, turns).execute(actor, thread_id)
    except DomainError as exc:
        raise to_http_error(exc) from exc


@router.post("/get_answer")
async def get_answer(
    request: QuestionRequest,
    actor: Actor = Depends(current_actor),
    threads: PostgresThreadRepository = Depends(thread_repository),
    turns: PostgresChatTurnRepository = Depends(chat_turn_repository),
    agent: AgentClient = Depends(agent_client),
    titles: ThreadTitleGenerator = Depends(title_generator),
):
    try:
        return await AskQuestionUseCase(threads, turns, agent, titles).execute(actor, request.text, request.thread_id)
    except DomainError as exc:
        raise to_http_error(exc) from exc


@router.post("/get_answer_stream")
async def get_answer_stream(
    request: QuestionRequest,
    actor: Actor = Depends(current_actor),
    threads: PostgresThreadRepository = Depends(thread_repository),
    turns: PostgresChatTurnRepository = Depends(chat_turn_repository),
    agent: AgentClient = Depends(agent_client),
    titles: ThreadTitleGenerator = Depends(title_generator),
):
    async def event_generator():
        try:
            usecase = StreamAnswerUseCase(threads, turns, agent, titles)
            async for event_name, payload in usecase.execute(actor, request.text, request.thread_id):
                yield _sse_event(event_name, payload)
        except Exception as exc:
            yield _sse_event("error", {"message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )

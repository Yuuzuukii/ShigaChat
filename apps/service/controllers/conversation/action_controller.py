from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from controllers.dependencies import (
    chat_turn_repository,
    current_actor,
    text_transformer,
    thread_repository,
    to_http_error,
)
from domain.shared.actor import Actor
from domain.shared.errors import DomainError
from infrastructure.llm.text_transformer import OpenAITextTransformer
from repositories.conversation.chat_turn_repository import PostgresChatTurnRepository
from repositories.conversation.thread_repository import PostgresThreadRepository
from usecases.conversation.apply_action import ApplyActionUseCase

router = APIRouter()


class ActionRequest(BaseModel):
    action: Literal["translate", "summarize", "simplify"]
    question: Optional[str] = None
    answer: Optional[str] = None
    text: Optional[str] = None
    target_lang: Optional[str] = None
    thread_id: Optional[int] = None
    action_label: Optional[str] = None


@router.post("/apply")
async def apply_action(
    request: ActionRequest,
    actor: Actor = Depends(current_actor),
    threads: PostgresThreadRepository = Depends(thread_repository),
    turns: PostgresChatTurnRepository = Depends(chat_turn_repository),
    transformer: OpenAITextTransformer = Depends(text_transformer),
):
    try:
        return ApplyActionUseCase(threads, turns, transformer).execute(
            actor,
            request.action,
            request.answer or request.text or "",
            request.target_lang,
            request.thread_id,
            request.action_label,
        )
    except DomainError as exc:
        raise to_http_error(exc) from exc

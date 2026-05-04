from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from domain.shared.actor import Actor
from domain.shared.errors import PermissionDeniedError


@dataclass(frozen=True)
class ChatReference:
    question: str
    answer: str
    question_id: int | None = None
    category_id: int | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ChatReference":
        return cls(
            question=str(data.get("question") or ""),
            answer=str(data.get("answer") or ""),
            question_id=data.get("question_id"),
            category_id=data.get("category_id"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "answer": self.answer,
            "question_id": self.question_id,
            "category_id": self.category_id,
        }


@dataclass(frozen=True)
class Thread:
    id: int
    user_id: int
    title: str | None
    last_updated: datetime | None = None

    def assert_owner(self, actor: Actor) -> None:
        if not actor.is_admin and self.user_id != actor.user_id:
            raise PermissionDeniedError("このスレッドにアクセスする権限がありません")


@dataclass(frozen=True)
class ChatTurn:
    id: int | None
    thread_id: int
    user_message: str
    assistant_message: str
    refs: list[ChatReference] = field(default_factory=list)
    type: str = "rag"
    created_at: datetime | None = None

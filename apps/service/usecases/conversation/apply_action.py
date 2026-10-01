from __future__ import annotations

from domain.conversation.models import ChatTurn
from domain.conversation.repositories import ChatTurnRepository, ThreadRepository
from domain.shared.actor import Actor
from domain.shared.errors import ValidationError
from domain.shared.language import LanguageCode
from infrastructure.llm.text_transformer import OpenAITextTransformer

ACTIONS = {"translate", "summarize", "simplify"}


class ApplyActionUseCase:
    def __init__(
        self,
        threads: ThreadRepository,
        chat_turns: ChatTurnRepository,
        transformer: OpenAITextTransformer,
    ) -> None:
        self.threads = threads
        self.chat_turns = chat_turns
        self.transformer = transformer

    def execute(
        self,
        actor: Actor,
        action: str,
        text: str,
        target_lang: str | None,
        thread_id: int | None,
        action_label: str | None,
    ) -> dict:
        if action not in ACTIONS:
            raise ValidationError("unsupported action")
        text = (text or "").strip()
        if not text:
            raise ValidationError("answer or text is required")

        target = LanguageCode.from_any(target_lang).value if target_lang else actor.language.value
        result = self.transformer.transform(action, text, target)

        thread = self.threads.find_by_id(thread_id) if thread_id is not None else None
        if thread:
            thread.assert_owner(actor)
        else:
            thread = self.threads.create(actor.user_id)

        label = (action_label or f"Action: {action}").strip()
        self.chat_turns.append(ChatTurn(None, thread.id, label, result, type="action"))
        self.threads.touch(thread.id)
        return {"result": result, "thread_id": thread.id}

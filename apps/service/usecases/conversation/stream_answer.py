from __future__ import annotations

from collections.abc import AsyncIterator

from domain.conversation.models import ChatReference, ChatTurn
from domain.conversation.repositories import ChatTurnRepository, ThreadRepository
from domain.shared.actor import Actor
from infrastructure.agent.agent_client import AgentClient
from infrastructure.llm.title_generator import ThreadTitleGenerator
from usecases.conversation.helpers import format_history_for_agent


class StreamAnswerUseCase:
    def __init__(
        self,
        threads: ThreadRepository,
        chat_turns: ChatTurnRepository,
        agent: AgentClient,
        title_generator: ThreadTitleGenerator,
    ) -> None:
        self.threads = threads
        self.chat_turns = chat_turns
        self.agent = agent
        self.title_generator = title_generator

    async def execute(self, actor: Actor, question: str, thread_id: int | None) -> AsyncIterator[tuple[str, dict]]:
        thread = self.threads.find_by_id(thread_id) if thread_id is not None else None
        if thread:
            thread.assert_owner(actor)
        else:
            thread = self.threads.create(actor.user_id)

        history = self.chat_turns.list_recent_by_thread(thread.id, 6)
        generated_title = self.title_generator.generate(question, actor.language.display_name) if not history else None
        yield "thread_ready", {"thread_id": thread.id, "thread_title": generated_title}

        answer_parts: list[str] = []
        refs: list[ChatReference] = []
        async for event_name, payload in self.agent.stream(question, thread.id, format_history_for_agent(history)):
            if event_name == "token":
                answer_parts.append(payload.get("content", ""))
                yield event_name, payload
            elif event_name == "end":
                refs = [ChatReference.from_dict(item) for item in payload.get("ref_qa", []) if isinstance(item, dict)]
            else:
                yield event_name, payload

        answer = "".join(answer_parts).strip()
        self.chat_turns.append(
            ChatTurn(None, thread.id, question, answer, refs=refs, type="rag")
        )
        self.threads.touch(thread.id, generated_title)
        rag_qa = [ref.to_dict() for ref in refs]
        yield "end", {
            "thread_id": thread.id,
            "thread_title": generated_title,
            "answer": answer,
            "ref_qa": rag_qa,
            "meta": {"references": rag_qa, "source": "agent"},
        }

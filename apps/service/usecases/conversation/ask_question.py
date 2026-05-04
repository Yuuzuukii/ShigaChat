from __future__ import annotations

from domain.conversation.models import ChatReference, ChatTurn
from domain.conversation.repositories import ChatTurnRepository, ThreadRepository
from domain.shared.actor import Actor
from domain.shared.errors import NotFoundError
from infrastructure.agent.agent_client import AgentClient
from infrastructure.llm.title_generator import ThreadTitleGenerator
from usecases.conversation.helpers import format_history_for_agent


class AskQuestionUseCase:
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

    async def execute(self, actor: Actor, question: str, thread_id: int | None) -> dict:
        thread = self._get_or_create_thread(actor, thread_id)
        history = self.chat_turns.list_recent_by_thread(thread.id, 6)
        is_first_turn = len(history) == 0
        generated_title = self.title_generator.generate(question, actor.language.display_name) if is_first_turn else None
        agent_response = await self.agent.generate(question, thread.id, format_history_for_agent(history))
        answer = (agent_response.get("answer") or "").strip()
        refs = [ChatReference.from_dict(item) for item in agent_response.get("ref_qa", []) if isinstance(item, dict)]
        self.chat_turns.append(
            ChatTurn(
                id=None,
                thread_id=thread.id,
                user_message=question,
                assistant_message=answer,
                refs=refs,
                type="rag",
            )
        )
        self.threads.touch(thread.id, generated_title)
        rag_qa = [ref.to_dict() for ref in refs]
        return {
            "thread_id": thread.id,
            "thread_title": generated_title,
            "question": question,
            "answer": answer,
            "type": "rag",
            "meta": {"references": rag_qa, "source": "agent"},
        }

    def _get_or_create_thread(self, actor: Actor, thread_id: int | None):
        if thread_id is None:
            return self.threads.create(actor.user_id)
        thread = self.threads.find_by_id(thread_id)
        if not thread:
            return self.threads.create(actor.user_id)
        thread.assert_owner(actor)
        return thread

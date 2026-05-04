from domain.conversation.repositories import ChatTurnRepository, ThreadRepository
from domain.shared.actor import Actor
from domain.shared.errors import NotFoundError


class GetThreadMessagesUseCase:
    def __init__(self, threads: ThreadRepository, chat_turns: ChatTurnRepository) -> None:
        self.threads = threads
        self.chat_turns = chat_turns

    def execute(self, actor: Actor, thread_id: int) -> dict:
        thread = self.threads.find_by_id(thread_id)
        if not thread:
            raise NotFoundError("スレッドが見つかりません")
        thread.assert_owner(actor)
        return {
            "messages": [
                {
                    "question": turn.user_message,
                    "answer": turn.assistant_message,
                    "created_at": turn.created_at,
                    "rag_qa": [ref.to_dict() for ref in turn.refs],
                    "type": turn.type,
                }
                for turn in self.chat_turns.list_by_thread(thread_id)
            ]
        }

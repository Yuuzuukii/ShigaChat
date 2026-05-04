from domain.conversation.repositories import ChatTurnRepository, ThreadRepository
from domain.shared.actor import Actor
from domain.shared.errors import NotFoundError


class DeleteThreadUseCase:
    def __init__(self, threads: ThreadRepository, chat_turns: ChatTurnRepository) -> None:
        self.threads = threads
        self.chat_turns = chat_turns

    def execute(self, actor: Actor, thread_id: int) -> dict:
        thread = self.threads.find_by_id(thread_id)
        if not thread:
            raise NotFoundError("スレッドが見つかりません")
        thread.assert_owner(actor)
        self.chat_turns.delete_by_thread(thread_id)
        self.threads.delete(thread_id)
        return {"message": "スレッドが正常に削除されました", "thread_id": thread_id}

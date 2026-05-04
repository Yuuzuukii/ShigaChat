from domain.conversation.repositories import ThreadRepository
from domain.shared.actor import Actor


class CreateThreadUseCase:
    def __init__(self, threads: ThreadRepository) -> None:
        self.threads = threads

    def execute(self, actor: Actor) -> dict:
        thread = self.threads.create(actor.user_id)
        return {"thread_id": thread.id}

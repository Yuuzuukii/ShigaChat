from domain.conversation.repositories import ThreadRepository
from domain.shared.actor import Actor


class ListThreadsUseCase:
    def __init__(self, threads: ThreadRepository) -> None:
        self.threads = threads

    def execute(self, actor: Actor) -> dict:
        return {
            "threads": [
                {"thread_id": thread.id, "title": thread.title or "無題", "last_updated": thread.last_updated}
                for thread in self.threads.list_by_user(actor.user_id)
            ]
        }

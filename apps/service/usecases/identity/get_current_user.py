from domain.identity.repositories import UserRepository
from domain.shared.errors import NotFoundError


class GetCurrentUserUseCase:
    def __init__(self, users: UserRepository) -> None:
        self.users = users

    def execute(self, user_id: int) -> dict:
        user = self.users.find_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        return {"id": user.id, "name": user.name, "spoken_language": user.language.display_name}

from domain.identity.repositories import UserRepository
from domain.shared.errors import ConflictError
from domain.shared.language import LanguageCode
from infrastructure.auth.password_hasher import PasswordHasher


class RegisterUserUseCase:
    def __init__(self, users: UserRepository, password_hasher: PasswordHasher) -> None:
        self.users = users
        self.password_hasher = password_hasher

    def execute(self, name: str, password: str, spoken_language: str) -> None:
        if self.users.find_by_name(name):
            raise ConflictError("この名前は既に使用されています")
        self.users.create(name, self.password_hasher.hash(password), LanguageCode.from_any(spoken_language))

from domain.identity.repositories import UserRepository
from domain.shared.errors import NotFoundError, PermissionDeniedError
from infrastructure.auth.jwt_service import JwtService
from infrastructure.auth.password_hasher import PasswordHasher


class LoginUserUseCase:
    def __init__(self, users: UserRepository, password_hasher: PasswordHasher, jwt_service: JwtService) -> None:
        self.users = users
        self.password_hasher = password_hasher
        self.jwt_service = jwt_service

    def execute(self, name: str, password: str) -> dict:
        user = self.users.find_by_name(name)
        if not user:
            raise NotFoundError("User not found")
        if not self.password_hasher.verify(password, user.password_hash):
            raise PermissionDeniedError("Incorrect password")
        token = self.jwt_service.create_access_token(
            {"id": user.id, "spoken_language": user.language.display_name}
        )
        return {"access_token": token, "token_type": "bearer"}

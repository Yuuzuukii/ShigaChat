from domain.identity.repositories import UserRepository
from domain.shared.language import LanguageCode
from infrastructure.auth.jwt_service import JwtService


class ChangeLanguageUseCase:
    def __init__(self, users: UserRepository, jwt_service: JwtService) -> None:
        self.users = users
        self.jwt_service = jwt_service

    def execute(self, user_id: int, language: str) -> dict:
        language_code = LanguageCode.from_any(language)
        self.users.update_language(user_id, language_code)
        token = self.jwt_service.create_access_token(
            {"id": user_id, "spoken_language": language_code.display_name}
        )
        return {"message": "Language updated successfully", "access_token": token}

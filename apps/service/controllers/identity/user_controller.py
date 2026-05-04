from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from controllers.dependencies import current_actor, jwt_service, password_hasher, to_http_error, user_repository
from domain.shared.actor import Actor
from domain.shared.errors import DomainError
from infrastructure.auth.jwt_service import JwtService
from infrastructure.auth.password_hasher import PasswordHasher
from repositories.identity.user_repository import PostgresUserRepository
from usecases.identity.change_language import ChangeLanguageUseCase
from usecases.identity.get_current_user import GetCurrentUserUseCase
from usecases.identity.login_user import LoginUserUseCase
from usecases.identity.register_user import RegisterUserUseCase

router = APIRouter()


class RegisterRequest(BaseModel):
    name: str
    password: str
    spoken_language: str


@router.post("/register")
async def register_user(
    request: RegisterRequest,
    users: PostgresUserRepository = Depends(user_repository),
    hasher: PasswordHasher = Depends(password_hasher),
):
    try:
        RegisterUserUseCase(users, hasher).execute(request.name, request.password, request.spoken_language)
        return {"message": "登録が完了しました"}
    except DomainError as exc:
        raise to_http_error(exc) from exc


@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    users: PostgresUserRepository = Depends(user_repository),
    hasher: PasswordHasher = Depends(password_hasher),
    jwt: JwtService = Depends(jwt_service),
):
    try:
        return LoginUserUseCase(users, hasher, jwt).execute(form_data.username, form_data.password)
    except DomainError as exc:
        raise to_http_error(exc) from exc


@router.get("/current_user")
async def get_current_user(
    actor: Actor = Depends(current_actor),
    users: PostgresUserRepository = Depends(user_repository),
):
    try:
        return GetCurrentUserUseCase(users).execute(actor.user_id)
    except DomainError as exc:
        raise to_http_error(exc) from exc


@router.post("/change_language")
async def change_language(
    language: str,
    actor: Actor = Depends(current_actor),
    users: PostgresUserRepository = Depends(user_repository),
    jwt: JwtService = Depends(jwt_service),
):
    return ChangeLanguageUseCase(users, jwt).execute(actor.user_id, language)

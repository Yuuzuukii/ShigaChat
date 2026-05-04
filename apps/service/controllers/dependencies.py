from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from domain.shared.actor import Actor
from domain.shared.errors import ConflictError, DomainError, NotFoundError, PermissionDeniedError, ValidationError
from infrastructure.agent.agent_client import AgentClient
from infrastructure.auth.jwt_service import JwtService
from infrastructure.auth.password_hasher import PasswordHasher
from infrastructure.llm.embedding_client import OpenAIEmbeddingClient
from infrastructure.llm.title_generator import ThreadTitleGenerator
from repositories.conversation.chat_turn_repository import PostgresChatTurnRepository
from repositories.conversation.thread_repository import PostgresThreadRepository
from repositories.identity.user_repository import PostgresUserRepository
from repositories.knowledge.category_repository import PostgresCategoryRepository
from repositories.knowledge.qa_repository import PostgresQARepository
from repositories.retrieval.embedding_repository import PostgresEmbeddingRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/user/token")


def user_repository() -> PostgresUserRepository:
    return PostgresUserRepository()


def thread_repository() -> PostgresThreadRepository:
    return PostgresThreadRepository()


def chat_turn_repository() -> PostgresChatTurnRepository:
    return PostgresChatTurnRepository()


def category_repository() -> PostgresCategoryRepository:
    return PostgresCategoryRepository()


def qa_repository() -> PostgresQARepository:
    return PostgresQARepository()


def embedding_repository() -> PostgresEmbeddingRepository:
    return PostgresEmbeddingRepository()


def password_hasher() -> PasswordHasher:
    return PasswordHasher()


def jwt_service() -> JwtService:
    return JwtService()


def agent_client() -> AgentClient:
    return AgentClient()


def title_generator() -> ThreadTitleGenerator:
    return ThreadTitleGenerator()


def embedding_client() -> OpenAIEmbeddingClient:
    return OpenAIEmbeddingClient()


def current_actor(
    token: str = Depends(oauth2_scheme),
    users: PostgresUserRepository = Depends(user_repository),
    jwt: JwtService = Depends(jwt_service),
) -> Actor:
    try:
        payload = jwt.verify(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    user_id = payload.get("id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token: User ID missing")
    user = users.find_by_id(int(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return Actor(user_id=user.id, language=user.language, role=payload.get("role", "user"))


def to_http_error(error: DomainError) -> HTTPException:
    if isinstance(error, NotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, PermissionDeniedError):
        return HTTPException(status_code=403, detail=str(error))
    if isinstance(error, ConflictError):
        return HTTPException(status_code=400, detail=str(error))
    if isinstance(error, ValidationError):
        return HTTPException(status_code=400, detail=str(error))
    return HTTPException(status_code=500, detail=str(error))

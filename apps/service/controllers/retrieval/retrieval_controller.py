from fastapi import APIRouter, Depends
from pydantic import BaseModel

from controllers.dependencies import embedding_client, embedding_repository
from infrastructure.llm.embedding_client import OpenAIEmbeddingClient
from repositories.retrieval.embedding_repository import PostgresEmbeddingRepository
from usecases.retrieval.retrieve_references import RetrieveReferencesUseCase

router = APIRouter()


class RetrievalRequest(BaseModel):
    question: str
    language: str = "ja"
    top_k: int = 5


@router.post("/search")
async def search_references(
    request: RetrievalRequest,
    embeddings: PostgresEmbeddingRepository = Depends(embedding_repository),
    client: OpenAIEmbeddingClient = Depends(embedding_client),
):
    return RetrieveReferencesUseCase(embeddings, client).execute(request.question, request.language, request.top_k)

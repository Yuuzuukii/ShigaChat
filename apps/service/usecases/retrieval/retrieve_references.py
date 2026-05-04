from domain.retrieval.repositories import EmbeddingRepository
from domain.shared.language import LanguageCode
from infrastructure.llm.embedding_client import OpenAIEmbeddingClient


class RetrieveReferencesUseCase:
    def __init__(self, embeddings: EmbeddingRepository, embedding_client: OpenAIEmbeddingClient) -> None:
        self.embeddings = embeddings
        self.embedding_client = embedding_client

    def execute(self, question: str, language: str, top_k: int = 5) -> dict:
        lang = LanguageCode.from_any(language)
        vector = self.embedding_client.embed(question)
        refs = self.embeddings.search(vector, lang, top_k)
        return {"ref_qa": [ref.to_dict() for ref in refs]}

from typing import Protocol

from domain.retrieval.models import RetrievedReference
from domain.shared.language import LanguageCode


class EmbeddingRepository(Protocol):
    def search(self, query_vector: list[float], language: LanguageCode, top_k: int) -> list[RetrievedReference]: ...

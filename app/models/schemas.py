from typing import Optional
from pydantic import BaseModel

# User モデルの定義
class User(BaseModel):
    name: str
    password: str
    spoken_language: str

    
class UserLogin(BaseModel):
    name: str
    password: str

class QuestionRequest(BaseModel):
    question_id: int

class Question(BaseModel):
    # thread_id is optional: omit to start a new thread (server will autoincrement)
    thread_id: Optional[int] = None
    text: str
    # Optional similarity threshold for RAG retrieval (0.0–1.0). Defaults server-side to 0.3
    similarity_threshold: Optional[float] = None
    # Optional model selection (gpt-4.1-nano, gpt-5-nano, gpt-5-mini)
    model: Optional[str] = None
    # Optional reasoning effort for GPT-5 models (minimal, low, high)
    reasoning_effort: Optional[str] = None
    
class NotificationRequest(BaseModel):
    id: int

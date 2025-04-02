from typing import Optional, Union, Tuple
from pydantic import BaseModel
from datetime import datetime

# User モデルの定義
class User(BaseModel):
    nickname: str
    password: str
    spoken_language: str
    gender: Optional[str] = "不明"  # デフォルトは "不明"
    age: int
    
class UserLogin(BaseModel):
    nickname: str
    password: str

class SimpleQuestion(BaseModel):
    category_id: Optional[int]
    language_id: int
    content: str
    public: bool = False

# Answer
class Answer(BaseModel):
    answer_id: int
    language_id: int
    update_time: datetime
    text:str

class AnswerRequest(BaseModel):
    question_id: int
    language: Optional[Union[int, str]] = None  # 言語もオプション
    user_id: int  # user_idを必須フィールドに戻す

class QuestionRequest(BaseModel):
    question_id: int

class AnswerEditRequest(BaseModel):
    answer_id: int
    new_text: str

class AnswerRequest(BaseModel):
    answer_id: int

class QuestionUpdateRequest(BaseModel):
    question_id: int
    title: str  

class moveCategoryRequest(BaseModel):
    question_id: int
    category_id: int

class RegisterQuestionRequest(BaseModel):
    category_id: int
    title: str
    content: str
    public: bool
    answer_text: str
    
class NotificationRequest(BaseModel):
    id: int


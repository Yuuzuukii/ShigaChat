from typing import Optional, Union, Tuple
from pydantic import BaseModel
from datetime import datetime

# User モデルの定義
class User(BaseModel):
    name: str
    password: str
    spoken_language: str

    
class UserLogin(BaseModel):
    name: str
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

class Question(BaseModel):
    # thread_id is optional: omit to start a new thread (server will autoincrement)
    thread_id: Optional[int] = None
    text: str

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
    content: str
    answer_text: str
    public: bool = True
    
class NotificationRequest(BaseModel):
    id: int

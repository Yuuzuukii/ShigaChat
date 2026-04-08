from pydantic import BaseModel
from typing import List, Optional
from dataclasses import dataclass

@dataclass
class RefQAItem:
    question: str
    answer: str
    question_id: Optional[int] = None
    category_id: Optional[int] = None

class RefQA(BaseModel):
    ref_qa: List[RefQAItem]

class RefSelection(BaseModel):
    selected_ids: List[str]

class Answer(BaseModel):
    content: str
    ref_qa: List[str]


class SimpleAnswer(BaseModel):
    answer: str
    ref_qa: List[RefQAItem]
    

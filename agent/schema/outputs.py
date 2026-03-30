from pydantic import BaseModel
from typing import List
from dataclasses import dataclass

@dataclass
class RefQAItem:
    question: str
    answer: str

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
    

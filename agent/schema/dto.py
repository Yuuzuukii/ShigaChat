from dataclasses import dataclass, field
from typing import TypedDict
from schema.outputs import RefQA

# グラフ実行時の引数みたいなもの
class Context(TypedDict):
    # 質問文
    question: str
    # 文字列化済みの会話履歴
    chat_history_text: str

# 実行中保持する値
@dataclass
class State:
    # 質問の言語
    language: str = ""
    # 検索用に書き換えたクエリ
    retrieval_query: str = ""
    # ベクトル検索の結果
    ref_qa: RefQA = field(default_factory=lambda: RefQA(ref_qa=[]))
    # 回答生成に使う最終プロンプト
    answer_prompt: str = ""

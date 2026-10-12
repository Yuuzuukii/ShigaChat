"""評価セットの正解QAの全文(日本語)を DB から書き出す。DB のQAを更新したら再実行する。

  python3 scripts/export_eval_sources.py

docker の postgres コンテナ(shigachat-postgres)に psql で問い合わせ、
data/eval_sources.json に { question_id: { question, answer } } を保存する。
"""
import csv
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
env = dict(
    line.split("=", 1) for line in (ROOT.parent / ".env").read_text().splitlines() if "=" in line and not line.startswith("#")
)

sql = """
select json_agg(json_build_object('question_id', qa.question_id, 'question', qt.texts, 'answer', at.texts))
from shigachat.qa qa
join shigachat.question_translation qt on qt.question_id = qa.question_id and qt.language_id = 1
join shigachat.answer_translation at on at.answer_id = qa.answer_id and at.language_id = 1
"""
out = subprocess.run(
    ["docker", "exec", "shigachat-postgres", "psql", "-U", env["PG_USER"], "-d", env["PG_DATABASE"], "-At", "-c", sql],
    check=True, capture_output=True, text=True,
).stdout
db = {row["question_id"]: row for row in json.loads(out)}

needed = set()
for name, col in (("eval_cases.csv", "gold_question_ids"), ("eval_conversations.csv", "gold_question_ids")):
    with open(ROOT / "data" / name, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            needed.update(int(x) for x in row[col].split(";") if x)

sources = {str(i): {"question": db[i]["question"], "answer": db[i]["answer"]} for i in sorted(needed)}
(ROOT / "data" / "eval_sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(sources)} 件を data/eval_sources.json に保存しました")

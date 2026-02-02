"""
テスト実行用エントリポイント。
環境変数を用意せずに実行した場合でも、ローカルのデフォルト値で
PostgreSQL/LLM に接続できるようにする。
"""

import os
import json
import sys

# デフォルトの環境変数を強制セット（シェル設定を上書き）
os.environ["PGHOST"] = "127.0.0.1"
os.environ["PGPORT"] = "5432"
os.environ["PGUSER"] = "postgres"
os.environ["PGPASSWORD"] = "postgres"
os.environ["PGDATABASE"] = "shigachat"

from api.rag.run_query import run_rag_query


def main():
    # コマンドライン引数があればそれを質問文に使う。なければデフォルト。
    question = sys.argv[1] if len(sys.argv) > 1 else "琵琶湖を一周したい"

    result = run_rag_query(question)
    # LLMの回答テキストのみ出力する
    print(result.get("answer", ""))


if __name__ == "__main__":
    main()

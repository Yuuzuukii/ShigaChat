# ShigaChat Agent

ShigaChat の回答生成専用サービスです。

`apps/service` から HTTP で呼び出され、LangGraph で以下の処理を行います。

- 質問言語の判定
- 会話履歴を踏まえた検索クエリの作成
- PostgreSQL + pgvector から参照 Q&A を検索
- 参照 Q&A の選別
- 回答プロンプトの生成
- OpenAI API による回答生成

## 構成

```text
apps/agent/
├── main.py              # FastAPI entrypoint
├── langgraph.json       # LangGraph Studio / CLI 用の graph 定義
├── pyproject.toml       # uv / Python package 設定
├── uv.lock              # Python dependency lock
├── Dockerfile
└── src/
    ├── agent/
    │   ├── graph.py         # 通常回答用 LangGraph
    │   ├── simple_graph.py  # service 側で参照QAを扱う簡易回答用 LangGraph
    │   └── routing.py       # graph の条件分岐
    ├── lib/
    │   ├── config.py        # DB 接続設定
    │   ├── language.py      # 言語判定/正規化
    │   ├── llm.py           # OpenAI 呼び出し
    │   ├── prompts.py       # Prompt template
    │   └── rag.py           # embedding + vector search
    └── schema/
        ├── dto.py           # LangGraph state/context
        └── outputs.py       # LLM structured output
```

## ディレクトリ方針

現在は `src` layout に統一しています。

`agent`, `lib`, `schema` はすべて `src/` 配下の Python package です。

```python
from agent.graph import graph
from lib.llm import call_llm
from schema.dto import State
```

`lib` や `schema` をプロジェクト直下に置く構成は避けます。`src` の外に置くと、Docker 実行・ローカル実行・LangGraph CLI 実行で import path がずれやすくなるためです。

LangGraph のデフォルトテンプレートは `src/agent/graph.py` を中心にした構成です。今回の実装では、RAG や OpenAI 呼び出し、DTO が増えているため、`src/lib` と `src/schema` に分けています。

## API

### `GET /health`

ヘルスチェックです。

### `POST /chat/stream`

LangGraph の各 node の進捗と回答 token を Server-Sent Events で返します。

主な event:

- `history_loaded`
- `language_detected`
- `query_rewritten`
- `vector_search_done`
- `reference_selected`
- `answer_start`
- `token`
- `end`
- `error`

### `POST /chat/simple`

`apps/service` 側で会話管理や参照情報の保存を行うための通常 JSON API です。

戻り値には以下を含みます。

- `answer`
- `ref_qa`
- `meta.references`
- `meta.model_used`
- `meta.retrieval_query`

## 環境変数

```env
OPENAI_API_KEY=
ANSWER_MODEL=gpt-5.4-nano
QUERY_REWRITE_MODEL=gpt-5.4-nano
REF_SELECTION_MODEL=gpt-5.4-nano

PG_HOST=postgres
PG_PORT=5432
PG_DATABASE=shigachat
PG_USER=...
PG_PASSWORD=...
```

Docker Compose では `PG_*` は `docker-compose.yml` から渡されます。

## 開発

```bash
cd apps/agent
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8001
```

LangGraph Studio / CLI を使う場合:

```bash
cd apps/agent
uv run langgraph dev
```

## Docker

通常はリポジトリルートから起動します。

```bash
docker compose up -d --build agent
```

`Dockerfile` は `uv.lock` を使って依存関係を固定します。

## 注意

- `agent` は DB の読み取りと OpenAI 呼び出しを行います。
- 会話履歴の永続化、JWT 認証、ユーザー管理は `apps/service` の責務です。
- `agent` は application boundary ではなく、回答生成に特化した内部サービスとして扱います。

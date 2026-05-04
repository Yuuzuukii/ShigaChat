# ShigaChat

ShigaChat は、滋賀県国際協会の生活相談 Q&A を参照しながら、多言語で相談支援を行う Web アプリケーションです。

現在の構成は、React フロントエンド、FastAPI のメイン API、LangGraph ベースの回答生成サービス、PostgreSQL + pgvector、DB 運用用の one-off maintenance コンテナです。

参照元 Q&A:

https://www.s-i-a.or.jp/qa

## 現在の主な機能

- ログイン / 新規登録
- JWT による API 認証
- ユーザーの使用言語変更
- スレッド型チャット
- SSE による回答ストリーミング
- 参照 Q&A を使った RAG 回答
- 回答に使った参照 Q&A の表示
- カテゴリ一覧 / カテゴリ別 Q&A 表示
- 類似 Q&A 検索
- SIA Q&A のクロールと DB 再投入
- PostgreSQL の dump / restore

対応言語:

日本語、English、Tiếng Việt、中文、한국어、Português、Español、Tagalog、Bahasa Indonesia

## アーキテクチャ

```text
apps/web
  React
  Radix UI
  lucide-react
  flag-icons
  nginx.conf
        │
        │ /api/
        ▼
apps/service
  FastAPI
  DDD / layered architecture
  認証、ユーザー、スレッド、カテゴリ、検索 API
        │
        │ AGENT_API_BASE_URL=http://agent:8001
        ▼
apps/agent
  FastAPI
  LangGraph
  OpenAI
  RAG / 回答生成
        │
        ▼
PostgreSQL + pgvector
  users
  threads
  thread_qa
  question / answer / translation
  qa_embedding
```

## ディレクトリ構成

```text
.
├── apps/
│   ├── service/      # メイン API。FastAPI + layered architecture
│   ├── agent/        # 回答生成サービス。FastAPI + LangGraph
│   └── web/          # React frontend。nginx 設定と build もここに置く
├── scripts/          # DB dump / restore / scrape / maintenance
├── backup/           # dump 出力先
├── docker-compose.yml
├── db.md             # 将来の DB 再設計メモ
└── DDD.md            # backend refactoring 計画メモ
```

## サービス構成

| Service | 役割 | Port |
|---|---|---:|
| `uvicorn` | `apps/service`。メイン FastAPI | `8000` |
| `agent` | `apps/agent`。LangGraph 回答生成 API | `8001` |
| `postgres` | PostgreSQL + pgvector | `5432` |
| `nginx` | `apps/web/build` の配信と `/api/` proxy | `80` |
| `maintenance` | DB 運用 / scrape 用 one-off container | profile: `tools` |

## API

### `apps/service`

| Prefix | Endpoint | 用途 |
|---|---|---|
| `/user` | `POST /register` | ユーザー登録 |
| `/user` | `POST /token` | ログイン |
| `/user` | `GET /current_user` | 現在ユーザー取得 |
| `/user` | `POST /change_language` | 使用言語変更 |
| `/question` | `POST /create_thread` | スレッド作成 |
| `/question` | `GET /get_user_threads` | スレッド一覧 |
| `/question` | `GET /get_thread_messages/{thread_id}` | メッセージ履歴 |
| `/question` | `DELETE /delete_thread/{thread_id}` | スレッド削除 |
| `/question` | `POST /get_answer` | 通常回答 |
| `/question` | `POST /get_answer_stream` | SSE 回答 |
| `/category` | `GET /categories` | カテゴリ一覧 |
| `/category` | `GET /category_translation/{category_id}` | カテゴリ名取得 |
| `/category` | `GET /category/{category_id}` | カテゴリ別 Q&A |
| `/category` | `GET /get_category_by_question` | 質問からカテゴリ逆引き |
| `/retrieval` | `POST /search` | 類似 Q&A 検索 |

### `apps/agent`

| Endpoint | 用途 |
|---|---|
| `GET /health` | agent healthcheck |
| `POST /chat/stream` | LangGraph の進捗と回答 token を SSE で返す |
| `POST /chat/simple` | JSON で回答と参照 Q&A を返す |

## 環境変数

### `.env`

リポジトリルートに作成します。

```bash
cp .env.example .env
```

主な項目:

```env
OPENAI_API_KEY=
SECRET_KEY=

PG_HOST=postgres
PG_PORT=5432
PG_DATABASE=shigachat
PG_USER=postgres
PG_PASSWORD=

NGINX_PORT=80
ANSWER_MODEL=gpt-5.4-nano
QUERY_REWRITE_MODEL=gpt-5.4-nano
REF_SELECTION_MODEL=gpt-5.4-nano
EMBEDDING_MODEL=text-embedding-3-small
```

### `.env.maintenance`

DB 運用・クロール再投入用です。通常 API の DB user とは分ける想定です。

```bash
cp .env.maintenance.example .env.maintenance
```

```env
PG_HOST=postgres
PG_PORT=5432
PG_DATABASE=shigachat
PG_USER=maintenance_user
PG_PASSWORD=
OPENAI_API_KEY=
```

### `apps/web`

開発用:

```env
# apps/web/.env.local
REACT_APP_API_URL=http://localhost:8000
REACT_APP_BASE_PATH=/
PUBLIC_URL=/
```

配信用:

```env
# apps/web/.env.deploy
REACT_APP_API_URL=https://your-host.example/shigachat/api
REACT_APP_BASE_PATH=/shigachat
PUBLIC_URL=/shigachat
```

## ローカル開発

### 1. DB / API / Agent を起動

```bash
docker compose up -d postgres agent uvicorn
```

アクセス先:

- Service API: `http://localhost:8000`
- Service API Docs: `http://localhost:8000/docs`
- Agent healthcheck: `http://localhost:8001/health`

### 2. フロントを開発モードで起動

```bash
cd apps/web
npm install
npm start
```

アクセス先:

```text
http://localhost:3000
```

## 配信用ビルド

`nginx` は `apps/web/build` を配信します。React の build も `apps/web` で作成します。

```bash
cd apps/web
npm install
npm run build
cd ../..
docker compose up -d --build nginx
```

`/shigachat` 配下に配信する場合:

```bash
cd apps/web
npm run build:deploy
cd ../..
docker compose up -d --build nginx
```

`apps/web/nginx.conf` は `/api/` を `uvicorn:8000` に proxy します。

## Python 依存管理

Python backend は `uv` に統一しています。

### service

```bash
cd apps/service
uv sync
uv run python -c "from main import app; print(app.title)"
```

### agent

```bash
cd apps/agent
uv sync
uv run python -c "from main import app; print(len(app.routes))"
```

Docker build でも `uv.lock` を使います。

## Frontend 依存方針

`apps/web` は以下に寄せています。

- React
- Radix UI
- lucide-react
- flag-icons
- Tailwind CSS

`framer-motion` と `sonner` は使っていません。Toast は Radix Toast ベースの実装です。

確認コマンド:

```bash
cd apps/web
npm run lint
npm run build
CI=true npm test -- --watchAll=false
```

## DB 運用 / スクレイプ

通常の API コンテナには運用スクリプトを入れません。DB dump / restore / scrape は `maintenance` profile の one-off container で実行します。

詳細は [scripts/README.md](scripts/README.md) を参照してください。

### ヘルプ

```bash
./scripts/maintenance.sh
```

### DB dump

```bash
./scripts/maintenance.sh dump /app/backup/manual.sql
```

### DB restore

既存データを置き換える破壊的操作です。

```bash
./scripts/maintenance.sh restore --confirm /app/backup/manual.sql
```

### SIA Q&A scrape + DB 再投入

```bash
./scripts/maintenance.sh scrape
./scripts/maintenance.sh scrape --skip-vector
./scripts/maintenance.sh scrape --skip-backup
```

## 動作確認

```bash
docker compose ps
docker compose logs uvicorn --tail 120
docker compose logs agent --tail 120
docker compose logs postgres --tail 120
```

フロント:

```bash
cd apps/web
npm run lint
npm run build
```

service:

```bash
cd apps/service
uv run python -c "from main import app; print(app.title, len(app.routes))"
```

agent:

```bash
cd apps/agent
uv run python -c "from main import app; print(len(app.routes))"
```

## 補足

- `apps/service` は DB、認証、会話履歴、カテゴリ、検索 API を担当します。
- `apps/agent` は回答生成に特化した内部サービスです。
- `apps/web/nginx.conf` は web 側に置いています。独立した `nginx/` ディレクトリは使っていません。
- 将来 DB を作り直す場合の案は `db.md`、バックエンド DDD 移行の計画は `DDD.md` に残しています。

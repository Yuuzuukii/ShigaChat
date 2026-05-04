# ShigaChat

ShigaChat は、公益財団法人滋賀県国際協会の生活相談 Q&A を参照しながら、多言語で相談支援を行う Web アプリケーションです。React フロントエンド、FastAPI API、LangGraph ベースの回答生成エージェント、PostgreSQL / pgvector を組み合わせた構成になっています。

参照元 Q&A:
https://www.s-i-a.or.jp/qa

## 主な機能

- JWT 認証によるログイン / 新規登録
- 9言語対応の UI と回答表示
- スレッド型チャット
- SSE による回答のストリーミング表示
- 初回質問を元にしたスレッドタイトル自動生成
- 回答に使った参照 Q&A の表示
- 直近回答に対する翻訳 / 要約 / わかりやすく書き換え
- キーワード検索
- 13カテゴリのカテゴリ閲覧
- 個人通知 / 全体通知 / 閲覧履歴
- PostgreSQL のバックアップ / 復元
- 参照 Q&A の再スクレイプと再投入

## 対応言語

日本語、English、Tiếng Việt、中文、한국어、Português、Español、Tagalog、Bahasa Indonesia

## アーキテクチャ

```text
React (apps/web/)
  ├─ ログイン / 新規登録
  ├─ チャット / スレッド管理
  ├─ キーワード検索 / カテゴリ検索
  └─ 通知 UI
        │
        ├─ 開発時: http://localhost:3000 -> FastAPI
        └─ 配信時: nginx -> /api/ を FastAPI にプロキシ

FastAPI (apps/service/)
  ├─ /user
  ├─ /question
  ├─ /action
  ├─ /keyword
  ├─ /category
  ├─ /notification
  └─ /history
        │
        └─ Agent API (apps/agent/)
             ├─ /chat/stream
             └─ /chat/simple

PostgreSQL + pgvector
  ├─ 参照 Q&A / 翻訳 / 通知
  ├─ threads
  └─ thread_qa
```

## サービス構成

| サービス | 役割 | デフォルトポート |
|---|---|---:|
| `uvicorn` | FastAPI 本体。認証、スレッド、通知、カテゴリ、検索 API を提供 | `8000` |
| `agent` | LangGraph ベースの回答生成サービス | `8001` |
| `postgres` | アプリ DB。`pgvector/pg16` を使用 | `5432` |
| `nginx` | 静的フロント配信と `/api/` のリバースプロキシ | `80` |
| `maintenance` | DB運用・参照 Q&A 再投入用の一時実行コンテナ | profiles: `tools` |

## 主要な API グループ

| Prefix | 用途 |
|---|---|
| `/user` | ユーザー登録、ログイン、現在ユーザー取得、使用言語変更 |
| `/question` | 回答生成、ストリーミング、スレッド一覧、メッセージ履歴、Q&A 取得 |
| `/action` | 翻訳、要約、簡略化の適用 |
| `/keyword` | 設定言語でのキーワード検索 |
| `/category` | カテゴリ名取得、カテゴリ別 Q&A 取得、質問からカテゴリ逆引き |
| `/notification` | 個人通知 / 全体通知の取得と既読化 |
| `/history` | 閲覧履歴 / 投稿履歴 |

フロントのチャット画面では、通常の回答生成に `/question/get_answer_stream` を使います。FastAPI は内部で `agent` の `/chat/stream` を呼び出し、返ってきたトークン列をそのまま SSE でフロントに流しつつ、最終結果を `thread_qa` に保存します。

## ディレクトリ構成

```text
.
├── apps/
│   ├── agent/   # 回答生成エージェント (FastAPI + LangGraph)
│   ├── service/ # メイン API (FastAPI)
│   └── web/     # React フロントエンド / nginx設定 / 配信用build
├── backup/     # バックアップ出力先
└── scripts/    # DB運用 / 再投入スクリプト
```

## 環境変数

### ルート `.env`

`.env.example` をコピーして作成します。

```env
# Required
OPENAI_API_KEY=your_openai_api_key
SECRET_KEY=your_secret_key

PG_HOST=postgres
PG_PORT=5432
PG_DATABASE=shigachat
PG_USER=postgres
PG_PASSWORD=your_password

# Optional
NGINX_PORT=80
ANSWER_MODEL=gpt-5.4-nano
QUERY_REWRITE_MODEL=gpt-5.4-nano
REF_SELECTION_MODEL=gpt-5.4-nano
EMBEDDING_MODEL=text-embedding-3-small
```

補足:

- `uvicorn` から `agent` へは `AGENT_API_BASE_URL=http://agent:8001` が `docker-compose.yml` で渡されます

### `apps/web/` のビルド用 env

```env
# apps/web/.env.local
REACT_APP_API_URL=http://localhost:8000
REACT_APP_BASE_PATH=/
PUBLIC_URL=/
```

```env
# apps/web/.env.deploy
REACT_APP_API_URL=https://your-host.example/shigachat/api
REACT_APP_BASE_PATH=/shigachat
PUBLIC_URL=/shigachat
```

必要に応じて `REACT_APP_MAINTENANCE_MODE=true` を追加すると、全画面をメンテナンス画面に切り替えられます。

## ローカル開発手順

ローカルでは、`web` の開発サーバーを使う構成が最も扱いやすいです。`nginx` は React をビルドしないため、日常開発では必須ではありません。

### 1. 環境変数を作成

```bash
cp .env.example .env
```

### 2. PostgreSQL を起動

```bash
docker compose up -d postgres
```

### 3. 初期データを投入

`restore_postgres.sh` は既存テーブルとデータを置き換えるため、破壊的です。

```bash
./scripts/restore_postgres.sh --confirm
```

別のダンプを使う場合:

```bash
./scripts/restore_postgres.sh --confirm /path/to/backup.sql
```

### 4. API / Agent を起動

```bash
docker compose up -d agent uvicorn
```

### 5. フロントを開発モードで起動

```bash
cd web
npm install
npm start
```

アクセス先:

- フロントエンド: `http://localhost:3000`
- FastAPI Docs: `http://localhost:8000/docs`
- Agent healthcheck: `http://localhost:8001/health`

## 配信用フロントビルド

`nginx` サービスは `apps/web/build` に置かれた静的ファイルをそのまま配信します。React のビルドは `apps/web/` で行います。

### ルート配下向けの静的 build 更新

```bash
cd apps/web
npm install
npm run build
```

この手順は `apps/web/build` の中身を更新するためのものです。ローカル開発中の動作確認は、基本的に `npm start` を使ってください。

### `/shigachat` 配下での配信用ビルド

`apps/web/.env.deploy` の `REACT_APP_API_URL` を配信先に合わせて調整したうえで実行します。

```bash
cd apps/web
npm install
npm run build:deploy
```

その後、必要なサービスをビルドして起動します。

```bash
cd ../..
docker compose up -d --build
```

注意:

- `apps/web/nginx.conf` は `/api/` を `uvicorn:8000` にプロキシします
- `nginx` 設定は、外側のリバースプロキシが `/shigachat` を剥がして転送する構成を想定しています

## 運用スクリプト

### PostgreSQL ダンプ

```bash
./scripts/dump_postgres.sh
./scripts/dump_postgres.sh /path/to/backup.sql
```

### PostgreSQL リストア

```bash
./scripts/restore_postgres.sh
./scripts/restore_postgres.sh --confirm /path/to/backup.sql
```

### 参照 Q&A の再スクレイプと再投入

```bash
./scripts/maintenance.sh scrape
```

オプション例:

```bash
./scripts/maintenance.sh scrape --skip-backup
./scripts/maintenance.sh scrape --skip-vector
```

`scrape_inject.py` は、SIA の 9言語ページをクロールし、Q&A と翻訳データを再投入し、必要に応じて `qa_embedding` も更新します。

## 主要な実装ポイント

- 回答生成は `apps/service/controllers/conversation/chat_controller.py` から `agent` へ委譲されます
- チャット履歴は `threads` と `thread_qa` に保存されます
- 回答後アクションを復活させる場合は `apps/service` 側にUseCase/Controllerを追加し、同じスレッド履歴に `type=action` として保存します
- フロントのカテゴリ一覧は `apps/web/src/config/categories.js` の静的定義を使い、カテゴリ詳細データは API から取得します
- 参照 Q&A はチャットメッセージ内で展開表示され、カテゴリ詳細画面に遷移できます

## 動作確認コマンド

```bash
docker compose ps
docker compose logs uvicorn --tail 120
docker compose logs agent --tail 120
docker compose logs postgres --tail 120
```

フロントの静的解析:

```bash
cd web
npm run lint
```

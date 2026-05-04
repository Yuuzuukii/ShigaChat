# ShigaChat

ShigaChat は、滋賀県国際協会の生活相談 Q&A を参照しながら、多言語で相談支援を行う Web アプリケーションです。

React のフロントエンド、FastAPI のメイン API、LangGraph ベースの回答生成サービス、PostgreSQL + pgvector を組み合わせています。

参照元 Q&A:

https://www.s-i-a.or.jp/qa

## 構成

- `apps/web`: React frontend。Radix UI、lucide-react、flag-icons、Tailwind CSS を使用。
- `apps/service`: FastAPI main API。認証、ユーザー、スレッド、カテゴリ、検索を担当。
- `apps/agent`: FastAPI + LangGraph。RAG と回答生成を担当。
- `postgres`: PostgreSQL + pgvector。
- `maintenance`: DB dump / restore / Q&A 再投入用の one-off container。

## Backend Architecture

`apps/service` は layered architecture を採用しています。DB テーブル単位ではなく、`identity`, `conversation`, `knowledge`, `retrieval` のようなサービス上の概念で分けています。詳細は [DDD.md](apps/service/DDD.md) を参照してください。

```text
controllers/
  HTTP request / response

usecases/
  アプリケーションの処理手順

domain/
  サービスが扱う概念と repository interface

repositories/
  PostgreSQL への具体的なアクセス

infrastructure/
  DB 接続、JWT、password hash、agent / OpenAI など外部接続
```

## 環境構築

### 1. 環境変数を作成

```bash
cp .env.example .env
```

必要な値を設定します。

```env
OPENAI_API_KEY=
SECRET_KEY=

PG_HOST=postgres
PG_PORT=5432
PG_DATABASE=shigachat
PG_USER=postgres
PG_PASSWORD=
```

DB 運用・Q&A 再投入を使う場合は、maintenance 用の env も作成します。

```bash
cp .env.maintenance.example .env.maintenance
```

### 2. backend / DB を起動

```bash
docker compose up -d postgres agent uvicorn
```

API:

- `http://localhost:8000`
- `http://localhost:8000/docs`

Agent:

- `http://localhost:8001/health`

### 3. frontend を起動

```bash
cd apps/web
npm install
npm start
```

frontend:

```text
http://localhost:3000
```

### 4. nginx で配信する場合

```bash
cd apps/web
npm install
npm run build
cd ../..
docker compose up -d --build nginx
```

nginx:

```text
http://localhost
```

### 5. DB 運用スクリプト

DB dump / restore / SIA Q&A 再投入は `scripts/maintenance.sh` から実行します。

```bash
./scripts/maintenance.sh
```

例:

```bash
./scripts/maintenance.sh dump /app/backup/manual.sql
./scripts/maintenance.sh restore --confirm /app/backup/manual.sql
./scripts/maintenance.sh scrape
```

詳細は [scripts/README.md](scripts/README.md) を参照してください。

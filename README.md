# ShigaChat

## システムの説明
本システム「Shiga Chat」は、滋賀国際協会の職員を対象とした多言語対応の限定公開Q&Aサービスである。
ChatGPTと検索拡張生成（RAG）を組み合わせることで、日常生活に関する質問に対して、迅速かつ地域特化の回答を提供する。
ユーザの質問に対し、RAGは関連する既存のQ&Aデータベースを検索・参照し、ChatGPTにテキストを渡す。渡されたテキストをChatGPTが自然な形で回答生成し、ユーザに返す。

対応言語：日本語、English、Tiếng Việt、中文、한국어、Português、Español、Tagalog、Bahasa Indonesia

## 作成にあたってこだわった点、注意した点
ユーザ体験の向上：質問の投稿から回答までの流れを直感的に設計。画面遷移や操作性に配慮し、初めて使う外国人ユーザでも使いやすいUIを意識。
情報の正確性と安全性：ChatGPTの誤回答（ハルシネーション）を防ぐため、回答の元となるQ&Aデータベースを構築。また、人手による内容チェック、多言語対応の文法チェックを導入。
多言語対応：通知や検索などの基本操作が全対応言語で可能なように設計し、多文化に配慮。

## 参照Q&A
公益財団法人滋賀県国際協会　生活相談Q&A
URL: https://www.s-i-a.or.jp/qa

## 動作手順

1. 🌱 環境変数の設定

このプロジェクトでは、APIキーやDB接続情報を `.env` に設定します。
プロジェクトルートに `.env` を作成し、以下を設定してください。

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here
SECRET_KEY=your_secret_key_here

PG_HOST=postgres
PG_PORT=5432
PG_DATABASE=shigachat
PG_USER=postgres
PG_PASSWORD=your_strong_password

# Optional (未設定時はデフォルト値を使用)
NGINX_PORT=80
LLM_MODEL=gpt-5-nano
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
```

2. 🐳 Dockerセットアップ

Docker Composeが利用できることを確認し、以下を実行してください。

```bash
docker compose build
docker compose up -d
docker compose ps
```

`uvicorn`（API 兼アプリ）、`agent`（RAG検索・回答生成）、`nginx`（フロント）、`postgres`（データベース）が起動します。

3. 🗄️ データベースセットアップ（初回必須）

初期スキーマと初期データを投入します。

```bash
./scripts/restore_postgres.sh --confirm
```

上記は `scripts/shigachat_dump.sql` を使ってDBを復元します（既存データは上書きされます）。
別ファイルを使う場合は次のように指定してください。

```bash
./scripts/restore_postgres.sh --confirm /path/to/backup.sql
```

4. ✅ 動作確認

- フロントエンド: `http://localhost:${NGINX_PORT:-80}`
- API: `http://localhost:8000/docs`

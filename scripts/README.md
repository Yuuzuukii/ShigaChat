# ShigaChat Maintenance Scripts

このディレクトリは、通常APIとは分離したDB運用・データ再投入用スクリプトを置く場所です。

## 方針

- APIコンテナには運用スクリプトを入れない
- `maintenance` コンテナは常駐させない
- 必要な時だけ `docker compose --profile tools run --rm maintenance ...` で一時実行する
- DB接続ユーザーはAPI用とは分け、`.env.maintenance` の `PG_USER` に `maintenance_user` を設定する

## ファイル一覧

| ファイル | 用途 | 危険度 |
|---|---|---|
| `maintenance.sh` | よく使う運用コマンドのラッパー | 中 |
| `Dockerfile.maintenance` | 一時実行用maintenanceイメージ | 低 |
| `scrape_inject.py` | SIA Q&Aをクロールし、QA/翻訳/embeddingを再投入 | 高 |
| `dump_postgres.sh` | DB全体をSQLダンプ | 中 |
| `restore_postgres.sh` | SQLダンプからDBを復元。既存データをDROP | 高 |
| `migrate_unify_schema.sh` | public配下のテーブルをshigachatスキーマへ移動 | 中 |
| `shigachat_dump.sql` | 現在保存されているSQLダンプ | 高 |

## 初期設定

```bash
cp .env.maintenance.example .env.maintenance
```

`.env.maintenance` にはメンテナンス用DBロールを設定してください。

```env
PG_HOST=postgres
PG_PORT=5432
PG_DATABASE=shigachat
PG_USER=maintenance_user
PG_PASSWORD=...
OPENAI_API_KEY=...
```

開発環境でまだDBロールを分けていない場合だけ、一時的に `PG_USER=postgres` を使えます。本番では避けてください。

## 実行方法

### ヘルプ

```bash
./scripts/maintenance.sh
```

### スクレイプ + DB再投入

```bash
./scripts/maintenance.sh scrape
```

オプション例:

```bash
./scripts/maintenance.sh scrape --skip-backup
./scripts/maintenance.sh scrape --skip-vector
./scripts/maintenance.sh scrape --fixed-datetime "2026-01-01 00:00:00+09"
```

この処理は以下を行います。

- SIAの9言語Q&Aページをクロール
- 実行前バックアップを作成
- QA/翻訳/embedding対象テーブルを再投入
- `--skip-vector` がない場合はOpenAI Embeddings APIを呼び出す

### DBダンプ

```bash
./scripts/maintenance.sh dump /app/backup/shigachat_$(date +%Y%m%d).sql
```

ホストから直接実行する場合:

```bash
./scripts/dump_postgres.sh ./backup/manual.sql
```

### DBリストア

```bash
./scripts/maintenance.sh restore --confirm /app/backup/manual.sql
```

注意:

- 既存の全テーブルとデータをDROPして復元します
- 本番では必ず事前バックアップを確認してください

### スキーマ統一

```bash
./scripts/maintenance.sh migrate-unify-schema
```

### メンテナンスコンテナのshell

```bash
./scripts/maintenance.sh shell
```

## 直接docker composeで実行する場合

```bash
docker compose --profile tools run --rm maintenance python3 scrape_inject.py --skip-vector
docker compose --profile tools run --rm maintenance bash dump_postgres.sh /app/backup/manual.sql
docker compose --profile tools run --rm maintenance bash restore_postgres.sh --confirm /app/backup/manual.sql
```

## 権限設計メモ

推奨DBロール:

```text
app_user
  API用。通常APIに必要な最小権限。

maintenance_user
  スクレイプ、再投入、バックアップなどの運用用。

postgres
  管理者。初期セットアップ/緊急作業のみ。
```

`maintenance_user` には、QA再投入に必要なテーブルだけ `SELECT/INSERT/UPDATE/DELETE` を付与してください。

`DROP TABLE`, `ALTER TABLE`, `CREATE ROLE` は通常不要です。

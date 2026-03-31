# ShigaChat Database Scripts

このディレクトリには、ShigaChatのデータベース管理用スクリプトが含まれています。

## PostgreSQL バックアップ・リストア

### ダンプ (バックアップ)

現在のPostgreSQLデータベース全体（スキーマ + データ）をSQLファイルにエクスポートします。

```bash
# デフォルト出力先 (scripts/shigachat_dump.sql)
./scripts/dump_postgres.sh

# カスタム出力先
./scripts/dump_postgres.sh /path/to/backup_20260202.sql
```

**出力内容:**
- 全スキーマ定義 (テーブル、インデックス、外部キー)
- 全データ (INSERT文)
- `--clean --if-exists` 付きなので、リストア時に既存テーブルをDROPして再作成
- ポータブル形式 (`--no-owner --no-privileges`)

### リストア (復元)

ダンプファイルからデータベースを復元します。

```bash
# デフォルト (scripts/shigachat_dump.sql から復元)
./scripts/restore_postgres.sh

# カスタムファイルから復元
./scripts/restore_postgres.sh /path/to/backup_20260202.sql

# 確認プロンプトをスキップ
./scripts/restore_postgres.sh --confirm backup_20260202.sql
```

**注意:**
- **既存の全テーブルとデータが削除されます**
- 実行前に現在のデータをバックアップすることを推奨
- リストア後に行数一覧を表示して検証

## マイグレーション

### スキーマ統一

すべてのテーブルを `shigachat` スキーマに統一します（`public` スキーマからの移動）。

```bash
./scripts/migrate_unify_schema.sh
```

**特徴:**
- 冪等性あり（既に統一済みなら何もしない）
- `public` スキーマにあるすべてのアプリケーションテーブルを自動検出して移動
- 実行後にスキーマ分布とテーブル一覧を表示

## データ再投入

### スクレイプ + DB投入

滋賀県国際協会のQ&Aページをスクレイプし、PostgreSQL と `qa_embedding` をまとめて再生成します。

```bash
docker compose run --rm --profile tools scraper
```

オプション例:

```bash
docker compose run --rm --profile tools scraper python3 scrape_inject.py --skip-backup
docker compose run --rm --profile tools scraper python3 scrape_inject.py --skip-vector
```

**特徴:**
- 実行前に DB バックアップを作成（`--skip-backup` 指定時を除く）
- `question` / `answer` / 翻訳テーブル / `qa_embedding` を再投入
- 埋め込み再生成をスキップ可能 (`--skip-vector`)

## ファイル一覧

| ファイル | 用途 |
|---------|------|
| `dump_postgres.sh` | PostgreSQLデータベース全体をSQLファイルにダンプ |
| `restore_postgres.sh` | ダンプファイルからPostgreSQLを復元 |
| `migrate_unify_schema.sh` | すべてのテーブルを `shigachat` スキーマに統一 |
| `scrape_inject.py` | 参照Q&Aを再スクレイプして PostgreSQL と `qa_embedding` に投入 |
| `Dockerfile.scraper` | `scraper` サービス用イメージ定義 |
| `shigachat_dump.sql` | 初期リストア用のSQLダンプ |

## 運用例

### 定期バックアップ

```bash
# 日次バックアップ (cronで実行)
./scripts/dump_postgres.sh /backup/shigachat_$(date +%Y%m%d).sql
```

### 開発環境リセット

```bash
# 本番データをダンプ
ssh prod-server 'cd /app && ./scripts/dump_postgres.sh' > prod_backup.sql

# 開発環境にリストア
./scripts/restore_postgres.sh --confirm prod_backup.sql
```

### 新機能デプロイ前のバックアップ

```bash
# デプロイ前
./scripts/dump_postgres.sh backup_before_deploy.sql

# マイグレーション実行
./scripts/migrate_unify_schema.sh

# 問題があればロールバック
# ./scripts/restore_postgres.sh --confirm backup_before_deploy.sql
```

## トラブルシューティング

### リストアが途中で失敗する

- ダンプファイルが破損していないか確認
- PostgreSQLコンテナが正常に動作しているか確認: `docker compose ps`
- ディスク容量が十分にあるか確認: `df -h`

### マイグレーションが適用されない

- PostgreSQLコンテナ名が正しいか確認: `docker ps | grep postgres`
- スクリプト内の `CONTAINER_NAME` が実際のコンテナ名と一致しているか確認

### search_pathエラー

現在のスキーマ構成は `shigachat` スキーマで、`search_path` は `public, shigachat` です。スクリプトはこの構成を想定しています。

確認方法:
```bash
docker compose exec postgres psql -U postgres -d shigachat -c "SHOW search_path;"
```

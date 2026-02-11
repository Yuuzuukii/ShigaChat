# ShigaChat デプロイガイド (GitHub Actions)

## 概要

GitHub Actions を使って、踏み台サーバー (ProxyJump) 経由で異なるネットワークにあるサーバーに自動デプロイします。

### ネットワーク構成

```
┌──────────────────────┐
│     GitHub Actions    │
│   (クラウドランナー)     │
└──────────┬───────────┘
           │ SSH (ポート 22)
           ▼
┌──────────────────────┐
│  踏み台 (Albatross)   │
│  133.19.45.15         │  ← グローバル IP
│  User: silab          │
└──────────┬───────────┘
           │ ProxyJump (内部ネットワーク)
           ▼
┌──────────────────────┐
│ デプロイ先サーバー      │  ← プライベート IP のみ
│ Falcon  10.40.34.12  │
│ Eagle   10.40.34.13  │
│ Swan    10.40.34.3   │
│  ┌────────────────┐  │
│  │  Docker Compose │  │
│  │  ┌──────────┐  │  │
│  │  │  Nginx   │  │  │
│  │  │ :80      │  │  │
│  │  ├──────────┤  │  │
│  │  │ Uvicorn  │  │  │
│  │  │ :8000    │  │  │
│  │  ├──────────┤  │  │
│  │  │PostgreSQL│  │  │
│  │  │ :5432    │  │  │
│  │  └──────────┘  │  │
│  └────────────────┘  │
└──────────────────────┘
```

| ワークフロー | 説明 |
|-------------|------|
| `.github/workflows/deploy.yml` | ProxyJump 経由の SSH デプロイ（メイン） |
| `.github/workflows/deploy-self-hosted.yml` | セルフホステッドランナー方式（代替） |

---

## 方式 1: ProxyJump SSH 方式（推奨）

### 前提条件

- 踏み台サーバー (Albatross) にインターネットから SSH 接続可能
- デプロイ先サーバーに `docker`, `docker compose`, `rsync` がインストール済み
- SSH 鍵が踏み台・デプロイ先の両方で認証に使える

### セットアップ手順

#### 1. SSH 公開鍵の登録

既存の鍵 `~/.ssh/sshkey_Yuzuki.txt` を使用します。

```bash
# 公開鍵の確認
cat ~/.ssh/sshkey_Yuzuki.txt.pub

# 踏み台サーバーに登録済みか確認
ssh Global-Albatross "cat ~/.ssh/authorized_keys"

# デプロイ先サーバーにも登録
ssh Global-Falcon "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
cat ~/.ssh/sshkey_Yuzuki.txt.pub | ssh Global-Falcon "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

#### 2. GitHub Secrets の登録

リポジトリの **Settings > Secrets and variables > Actions** で以下を登録:

##### 踏み台サーバー (Albatross)

| Secret 名 | 値 | 例 |
|-----------|---|---|
| `PROXY_HOST` | 踏み台のグローバル IP | `133.19.45.15` |
| `PROXY_USER` | 踏み台の SSH ユーザー名 | `silab` |
| `PROXY_PORT` | 踏み台の SSH ポート | `22` |

##### デプロイ先サーバー

| Secret 名 | 値 | 例 |
|-----------|---|---|
| `DEPLOY_HOST` | デプロイ先の**プライベート IP** | `10.40.34.12` |
| `DEPLOY_USER` | デプロイ先の SSH ユーザー名 | `masuo` |
| `DEPLOY_PORT` | デプロイ先の SSH ポート | `22` |
| `DEPLOY_PATH` | リモートの配置パス | `/var/services/masuo/ShigaChat_latest` |

##### 共通

| Secret 名 | 値 | 例 |
|-----------|---|---|
| `DEPLOY_SSH_KEY` | SSH **秘密鍵** の中身 (`sshkey_Yuzuki.txt`) | `-----BEGIN OPENSSH...` |
| `ENV_FILE` | 本番用 .env の内容 (下記参照) | - |
| `REACT_APP_API_URL` | フロントエンドの API URL | `http://10.40.34.12` |

> ⚠️ `DEPLOY_HOST` にはグローバル IP ではなく **プライベート IP** を設定してください。
> 踏み台を経由して内部ネットワークからアクセスするためです。

#### 3. ENV_FILE の例

```env
SECRET_KEY=your-secret-key-here
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
PG_HOST=postgres
PG_PORT=5432
PG_DATABASE=shigachat
PG_USER=postgres
PG_PASSWORD=your-strong-password
```

#### 4. 秘密鍵の登録方法

```bash
# 秘密鍵の中身をクリップボードにコピー (macOS)
pbcopy < ~/.ssh/sshkey_Yuzuki.txt

# GitHub の Settings > Secrets > New repository secret で
# Name: DEPLOY_SSH_KEY
# Value: ペースト
```

#### 5. デプロイ実行

- `main` ブランチに push すると自動でデプロイ
- GitHub の **Actions** タブから手動実行も可能 (workflow_dispatch)

---

## 方式 2: セルフホステッドランナー方式（代替）

> 踏み台サーバーが利用できない場合や、SSH ポートが外部に開けられない場合に使用

詳細は `.github/workflows/deploy-self-hosted.yml` のコメントを参照してください。

---

## トラブルシューティング

### ProxyJump 経由で SSH 接続できない

```bash
# まず踏み台に直接接続できるか確認
ssh -i ~/.ssh/sshkey_Yuzuki.txt silab@133.19.45.15

# 踏み台経由でデプロイ先に接続できるか確認
ssh Global-Falcon

# 詳細ログを表示して原因を特定
ssh -vvv Global-Falcon
```

### rsync でタイムアウトする

```bash
# 踏み台からデプロイ先への内部接続を確認
ssh Global-Albatross "ssh masuo@10.40.34.12 'echo OK'"
```

### Docker Compose でエラーが出る

```bash
# デプロイ先に SSH 接続してログを確認
ssh Global-Falcon
cd /opt/shigachat
docker compose logs -f

# 個別サービスの再起動
docker compose restart uvicorn
```

### GitHub Actions のログ確認

1. リポジトリの **Actions** タブを開く
2. 失敗したワークフローをクリック
3. 各ステップのログを展開して確認

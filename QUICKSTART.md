# ベクトルインデックス問題 - クイックスタートガイド

## 🎯 問題の概要

**データベースに存在しないQAデータが192件、ベクトルインデックスに残っています。**

これにより、削除したはずのデータがRAG検索で返される問題が発生しています。

---

## 🚀 すぐに実行できる解決方法

### オプション1: 自動スクリプトで再構築（推奨）

```bash
cd /Users/yuzuki/Desktop/ShigaChat

# バックアップ付きで再構築
./rebuild_vectors.sh --backup --verify
```

### オプション2: 手動で再構築

```bash
# 1. バックアップ
docker exec shigachat-uwsgi-1 sh -c "
    cd /var/www/api/utils &&
    tar czf vectors_backup_\$(date +%Y%m%d_%H%M%S).tar.gz vectors/
"

# 2. 再構築
docker exec -it shigachat-uwsgi-1 python3 -c "
import sys
sys.path.insert(0, '/var/www')
from api.utils.RAG import generate_and_save_vectors
generate_and_save_vectors()
"
```

**所要時間**: 5-10分  
**費用**: 約$0.01-0.05（OpenAI API）

---

## 📊 現状確認

```bash
# 現在の状態を確認
docker exec shigachat-uwsgi-1 python3 -c "
import sys, pickle
sys.path.insert(0, '/var/www')
from database_utils import get_db_cursor

with get_db_cursor() as (cursor, conn):
    cursor.execute('SELECT COUNT(*) as cnt FROM QA')
    print('DB:', cursor.fetchone()['cnt'], '件')

with open('./api/utils/vectors/vectors_ja.meta.pkl', 'rb') as f:
    print('Vector:', len(pickle.load(f)), '件')
"
```

**期待される結果**: 両方とも同じ件数（182件）

---

## 📚 詳細ドキュメント

- **詳細な調査報告**: `INVESTIGATION_REPORT.md`
- **再構築手順**: `VECTOR_REBUILD_GUIDE.md`
- **検証スクリプト**: `check_vectors_simple.py`, `verify_vectors_detailed.py`

---

## ⚠️ 注意事項

1. **処理中はサービスが遅くなる可能性があります**
2. **OpenAI APIが呼ばれるため、費用が発生します**
3. **必ずバックアップを取ってから実行してください**

---

## 🆘 問題が発生した場合

### バックアップから復元

```bash
# 最新のバックアップを確認
ls -lt vector_backups/

# 復元
docker cp vector_backups/vectors_backup_YYYYMMDD_HHMMSS.tar.gz \
    shigachat-uwsgi-1:/var/www/api/utils/
docker exec shigachat-uwsgi-1 sh -c "
    cd /var/www/api/utils &&
    rm -rf vectors &&
    tar xzf vectors_backup_YYYYMMDD_HHMMSS.tar.gz
"
```

### ログ確認

```bash
docker logs shigachat-uwsgi-1 --tail 100
```

---

**作成日**: 2025年10月16日  
**バージョン**: 1.0

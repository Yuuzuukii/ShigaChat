# ベクトルインデックス問題調査報告書

**調査日時**: 2025年10月16日  
**問題**: データベースに存在しないデータがRAGで検索される

---

## 🔍 調査結果サマリー

### 問題の確認

✅ **問題を再現・確認しました**

- **データベース内のQA数**: 182件
- **ベクトルインデックス内のQA数**: 222件（日本語）
- **差分**: 40件の過剰ベクトル
- **孤立ベクトル**: **192件** （データベースにも無視リストにも存在しない）

### 孤立ベクトルの詳細

以下は削除されたQAデータがベクトルインデックスに残っている例：

| QA_ID | Question_ID | 質問（抜粋） | 状態 |
|-------|-------------|--------------|------|
| 1679  | 1731 | 滋賀県パートナーシップ宣誓制度... | DBに存在せず |
| 1680  | 1732 | 二輪車のルールを知ってますか？ | DBに存在せず |
| 1681  | 1733 | 金融トラブルにご注意！！ | DBに存在せず |
| 1682  | 1734 | 自転車で琵琶湖一周... | DBに存在せず |
| 1683  | 1735 | 成年年齢が18歳に... | DBに存在せず |

**孤立QA_ID一覧**（192件）:
```
185, 187, 188, 190, 192, 
1679-1748 (範囲内の多数), 
1755-1827 (範囲内の多数), 
1922, 1960, 
1981-2033 (範囲内の多数), 
2035
```

---

## 🎯 根本原因の特定

### 1. ベクトルインデックスの更新方式の問題

**現在の実装**:
- QA追加時: `append_qa_to_vector_index()` でベクトルを追加 ✅
- QA更新時: `ignore_current_vectors_for_qa()` で旧バージョンを無視 ⚠️
- QA削除時: **ベクトルは削除されない** ❌

**問題点**:
```python
# app/api/utils/RAG.py の実装
def append_qa_to_vector_index(question_id, answer_id):
    # ベクトルを追加するだけで、古いベクトルは削除しない
    index.add(emb)  # FAISSに追加
    meta_list.append((qa_id, question_id))
    # ...保存
```

FAISSインデックスは**追記専用**で、削除はサポートされていません。そのため、削除されたQAのベクトルがインデックスに残り続けます。

### 2. 無視機能の不完全性

**ignoreリスト**: 5件のみ [183, 184, 1921, 2034, 2037]

```python
# app/api/utils/RAG.py
_GLOBAL_QA_IGNORE = VECTOR_DIR / "vectors_ignore_qa.json"
```

削除時に`add_qa_id_to_ignore()`が呼ばれていないため、無視リストに追加されていません。

### 3. 削除処理の実装確認

`app/api/routes/admin.py`を確認した結果、QA削除時にベクトル関連の処理が呼ばれていない可能性が高いです。

---

## ⚠️ 影響範囲

### ユーザーへの影響

1. **誤った情報の提供**: 削除されたQAデータが検索結果に表示される
2. **検索精度の低下**: 古い・無効なデータが上位に来る可能性
3. **混乱**: 管理画面で削除したはずのデータが表示される

### 各言語での状況

| 言語 | ベクトル数 | データとの差分（推定） |
|------|-----------|----------------------|
| 日本語 (ja) | 222 | +40件 |
| 英語 (en) | 203 | +21件 |
| ベトナム語 (vi) | 216 | +34件 |
| 中国語 (zh) | 200 | +18件 |
| 韓国語 (ko) | 196 | +14件 |

---

## 🔧 推奨される対処法

### 【緊急】即時対応（推奨）

**ベクトルインデックスの完全再構築**

```bash
# 1. バックアップ
docker exec shigachat-uwsgi-1 sh -c "
    cd /var/www/api/utils &&
    tar czf vectors_backup_\$(date +%Y%m%d_%H%M%S).tar.gz vectors/
"

# 2. 再構築実行
docker exec -it shigachat-uwsgi-1 python3 -c "
import sys
sys.path.insert(0, '/var/www'
from api.utils.RAG import generate_and_save_vectors
generate_and_save_vectors()
"
```

**所要時間**: 約5-10分  
**費用**: OpenAI API利用料 約$0.01-0.05  
**効果**: データベースとの完全同期

### 【暫定】無視リスト更新

完全再構築が難しい場合の暫定対応:

```bash
docker exec -it shigachat-uwsgi-1 python3 << 'EOF'
import sys, json, pickle
sys.path.insert(0, '/var/www')
from database_utils import get_db_cursor

# Get DB QA IDs
with get_db_cursor() as (cursor, conn):
    cursor.execute('SELECT id FROM QA')
    db_qa_ids = set(row['id'] for row in cursor.fetchall())

# Load current ignore list
with open('./api/utils/vectors/vectors_ignore_qa.json', 'r') as f:
    ignored = set(json.load(f))

# Load vector meta
with open('./api/utils/vectors/vectors_ja.meta.pkl', 'rb') as f:
    meta = pickle.load(f)

# Find orphaned
orphaned = {qa_id for qa_id, _ in meta if qa_id and qa_id not in db_qa_ids and qa_id not in ignored}

# Update ignore list
new_ignore = sorted(list(ignored | orphaned))
with open('./api/utils/vectors/vectors_ignore_qa.json', 'w') as f:
    json.dump(new_ignore, f, ensure_ascii=False, indent=2)

print(f'無視リスト更新: {len(orphaned)} 件追加')
EOF
```

**効果**: 孤立ベクトルが検索結果から除外される  
**デメリット**: インデックスサイズは変わらない、根本解決ではない

---

## 🛠️ 恒久対策

### 1. 削除処理の修正

`app/api/routes/admin.py`のQA削除処理を修正:

```python
from api.utils.RAG import add_qa_id_to_ignore

# QA削除時
@router.delete("/qa/{qa_id}")
async def delete_qa(qa_id: int):
    # ベクトルを無視リストに追加
    add_qa_id_to_ignore(qa_id)
    
    # データベースから削除
    with get_db_cursor() as (cursor, conn):
        cursor.execute("DELETE FROM QA WHERE id = %s", (qa_id,))
        conn.commit()
    
    return {"message": "削除しました"}
```

### 2. 定期メンテナンス

月次でベクトルインデックスを再構築:

```bash
# Cronジョブ例（毎月1日午前3時）
0 3 1 * * docker exec shigachat-uwsgi-1 python3 -c "import sys; sys.path.insert(0, '/var/www'); from api.utils.RAG import generate_and_save_vectors; generate_and_save_vectors()"
```

### 3. 監視アラート

整合性チェックスクリプトを定期実行し、閾値を超えたらアラート:

```python
# check_vector_consistency.py
orphaned_count = len(orphaned_vectors)
if orphaned_count > 50:  # 閾値
    send_alert(f"ベクトル孤立が{orphaned_count}件検出されました")
```

---

## 📊 検証コマンド

### 現在の状態確認

```bash
# QA数確認
docker exec shigachat-uwsgi-1 sh -c 'python3 -c "
import sys
sys.path.insert(0, \"/var/www\")
from database_utils import get_db_cursor
with get_db_cursor() as (cursor, conn):
    cursor.execute(\"SELECT COUNT(*) as cnt FROM QA\")
    print(\"DB QA count:\", cursor.fetchone()[\"cnt\"])
"'

# ベクトル数確認
docker exec shigachat-uwsgi-1 sh -c 'python3 -c "
import pickle
with open(\"./api/utils/vectors/vectors_ja.meta.pkl\", \"rb\") as f:
    print(\"Vector count:\", len(pickle.load(f)))
"'
```

### 孤立ベクトル確認

```bash
cd /Users/yuzuki/Desktop/ShigaChat
python3 check_vectors_simple.py
```

---

## 📝 今後のアクション

### 必須
- [ ] ベクトルインデックスの完全再構築を実行
- [ ] 削除処理に`add_qa_id_to_ignore()`を追加
- [ ] 再構築後の整合性を確認

### 推奨
- [ ] 定期メンテナンスのスケジュール設定
- [ ] 管理画面にベクトル再構築ボタンを追加
- [ ] 整合性チェックの自動化

### 将来的に検討
- [ ] FAISSの代わりに削除をサポートするベクトルDBの導入（Qdrant, Weaviate等）
- [ ] ベクトルインデックスのバージョン管理
- [ ] ロールバック機能の実装

---

## 📚 関連ファイル

- `app/api/utils/RAG.py`: ベクトル管理のメインファイル
- `app/api/routes/admin.py`: 管理者用API（削除処理含む）
- `app/api/utils/vectors/`: ベクトルデータディレクトリ
- `VECTOR_REBUILD_GUIDE.md`: 再構築手順書
- `check_vectors_simple.py`: 簡易検証スクリプト
- `verify_vectors_detailed.py`: 詳細検証スクリプト

---

**報告者**: システム調査  
**最終更新**: 2025年10月16日 16:30

# ベクトルインデックス再構築ガイド

## 📋 問題の概要

### 調査結果

**データベースに存在しないQAデータがRAGで検索される問題が確認されました。**

- **データベース内のQA数**: 182件
- **日本語ベクトル数**: 222件
- **孤立ベクトル数**: 192件（データベースにも無視リストにも存在しない）
- **無視リスト**: 5件のQA_ID [183, 184, 1921, 2034, 2037]

### 孤立ベクトルの例

以下のQA_IDがベクトルインデックスに存在するが、データベースには存在しません：
```
185, 187, 188, 190, 192, 1679-1748, 1755-1827, 1922, 1960, 1981-2033, 2035
```

### 原因分析

1. **データ削除時の不整合**: QAがデータベースから削除されても、ベクトルインデックスからは削除されていない
2. **ignore機能の不完全な実装**: 削除時に`add_qa_id_to_ignore()`が呼ばれていない、またはハッシュベースの無視が機能していない
3. **append方式の限界**: ベクトルインデックスは追記方式で更新されるため、削除されたエントリが残る

---

## 🔧 解決方法

### 方法1: 完全再構築（推奨）

ベクトルインデックスを完全に再構築することで、データベースとの整合性を確保します。

#### ステップ1: バックアップ

```bash
# 現在のベクトルファイルをバックアップ
docker exec shigachat-uwsgi-1 sh -c "
    cd /var/www/api/utils &&
    tar czf vectors_backup_\$(date +%Y%m%d_%H%M%S).tar.gz vectors/
"

# バックアップをホストにコピー（オプション）
docker cp shigachat-uwsgi-1:/var/www/api/utils/vectors_backup_*.tar.gz ./
```

#### ステップ2: ベクトルインデックスの再構築

```bash
# Dockerコンテナ内で再構築を実行
docker exec -it shigachat-uwsgi-1 python3 -c "
import sys
sys.path.insert(0, '/var/www')
from api.utils.RAG import generate_and_save_vectors
generate_and_save_vectors()
"
```

**注意事項**:
- 処理時間: QA数に依存（182件で約5-10分程度）
- API費用: OpenAI Embedding APIが呼ばれます（約$0.01-0.05程度）
- サービス影響: 処理中は応答が遅くなる可能性があります

#### ステップ3: 検証

```bash
# 再構築後のベクトル数を確認
docker exec shigachat-uwsgi-1 sh -c 'python3 -c "
import pickle
with open(\"./api/utils/vectors/vectors_ja.meta.pkl\", \"rb\") as f:
    meta = pickle.load(f)
print(f\"ベクトル数: {len(meta)}\")
"'
```

---

### 方法2: 無視リストの更新（暫定的）

完全再構築ができない場合、孤立ベクトルを無視リストに追加します。

```bash
# 孤立QA_IDを無視リストに追加
docker exec -it shigachat-uwsgi-1 python3 -c "
import sys
import json
sys.path.insert(0, '/var/www')
from database_utils import get_db_cursor

# DB QA IDs
with get_db_cursor() as (cursor, conn):
    cursor.execute('SELECT id FROM QA')
    db_qa_ids = set(row['id'] for row in cursor.fetchall())

# Current ignore list
with open('./api/utils/vectors/vectors_ignore_qa.json', 'r') as f:
    ignored = set(json.load(f))

# Vector meta
import pickle
with open('./api/utils/vectors/vectors_ja.meta.pkl', 'rb') as f:
    meta = pickle.load(f)

# Find orphaned
orphaned = set()
for qa_id, _ in meta:
    if qa_id and qa_id not in db_qa_ids and qa_id not in ignored:
        orphaned.add(qa_id)

# Update ignore list
new_ignore = sorted(list(ignored | orphaned))
with open('./api/utils/vectors/vectors_ignore_qa.json', 'w') as f:
    json.dump(new_ignore, f, ensure_ascii=False, indent=2)

print(f'無視リストを更新: {len(new_ignore)} 件')
"
```

**デメリット**:
- ベクトルインデックスのサイズが大きいまま
- 検索パフォーマンスに影響
- 根本的な解決ではない

---

## 🔍 今後の対策

### 1. 削除処理の改善

`app/api/routes/admin.py` の削除処理で、ベクトル無視機能を必ず呼び出すようにします。

```python
# QA削除時
from api.utils.RAG import add_qa_id_to_ignore

# 削除前にベクトルを無視リストに追加
add_qa_id_to_ignore(qa_id)

# その後、データベースから削除
cursor.execute("DELETE FROM QA WHERE id = %s", (qa_id,))
```

### 2. 定期的な整合性チェック

cron等で定期的にベクトルとDBの整合性をチェックし、必要に応じて再構築します。

### 3. 管理画面への機能追加

管理者が簡単にベクトル再構築を実行できるボタンをAdmin UIに追加することを検討してください。

---

## 📊 検証スクリプト

整合性を確認するためのスクリプト:

```bash
# ホストから実行
cd /Users/yuzuki/Desktop/ShigaChat
python3 check_vectors_simple.py
```

詳細な検証:
```bash
python3 verify_vectors_detailed.py
```

---

## 🆘 トラブルシューティング

### Q: 再構築が途中で止まる
A: OpenAI APIのレート制限に引っかかった可能性があります。しばらく待ってから再実行してください。

### Q: 再構築後もベクトル数が合わない
A: 以下を確認してください:
- データベースのQA数: `SELECT COUNT(*) FROM QA`
- 各言語の翻訳データの有無
- エラーログ: `docker logs shigachat-uwsgi-1`

### Q: メモリ不足エラー
A: Dockerのメモリ上限を増やすか、バッチサイズを小さくして処理してください。

---

## 📝 参考情報

### ベクトルファイルの構造

```
app/api/utils/vectors/
├── vectors_ja.faiss          # FAISSインデックス（日本語）
├── vectors_ja.meta.pkl       # メタデータ (qa_id, question_id)
├── vectors_ja.texts.pkl      # テキストデータ (question, answer, time)
├── vectors_ja.ignore_hash.json  # 無視するハッシュリスト
└── vectors_ignore_qa.json    # 無視するQA_IDリスト（全言語共通）
```

### RAG.pyの主要関数

- `generate_and_save_vectors()`: 全ベクトルを再構築
- `append_qa_to_vector_index(question_id, answer_id)`: 単一QAを追加
- `add_qa_id_to_ignore(qa_id)`: QAを無視リストに追加
- `ignore_current_vectors_for_qa(question_id, answer_id)`: 現在のベクトルをハッシュで無視

---

**最終更新**: 2025年10月16日
**作成者**: システム調査

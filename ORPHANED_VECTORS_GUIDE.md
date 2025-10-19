# 孤立ベクトル対処ガイド

## 🤔 2つの対処方法

### 方法A: JSON無視リストに追加（推奨：今すぐ実行）⚡

**特徴**:
- ✅ **実行時間**: 1分以内
- ✅ **費用**: 無料
- ✅ **リスク**: 低い（元データは変更しない）
- ✅ **効果**: 孤立ベクトルが検索結果から除外される
- ⚠️ **制限**: ファイルサイズは変わらない

**実行方法**:
```bash
# 自動スクリプトで実行（推奨）
./add_to_ignore_list.sh

# または手動で確認しながら実行
python3 add_orphaned_to_ignore.py
```

---

### 方法B: ベクトルファイルを完全再構築（根本的解決）🔄

**特徴**:
- ✅ **効果**: ファイルサイズが減る、メモリ使用量が減る
- ✅ **根本解決**: クリーンな状態になる
- ⚠️ **実行時間**: 5-10分
- ⚠️ **費用**: OpenAI API 約$0.01-0.05
- ⚠️ **リスク**: 中程度（バックアップ必須）

**実行方法**:
```bash
# 自動スクリプトで実行（バックアップ付き）
./rebuild_vectors.sh --backup --verify

# または手動で実行
docker exec -it shigachat-uwsgi-1 python3 -c "
import sys
sys.path.insert(0, '/var/www'
from api.utils.RAG import generate_and_save_vectors
generate_and_save_vectors()
"
```

---

## 🎯 推奨フロー

### ステップ1: まず無視リストに追加（今すぐ）

```bash
./add_to_ignore_list.sh
```

これで**即座に問題が解決**します。孤立ベクトルは検索結果に表示されなくなります。

### ステップ2: アプリケーションを再起動

```bash
docker-compose restart uwsgi
```

### ステップ3: 動作確認

RAG検索をテストして、削除したQAが表示されないことを確認。

### ステップ4: 後日、完全再構築（オプション）

時間があるときに、ベクトルファイルを完全再構築してファイルサイズを最適化：

```bash
./rebuild_vectors.sh --backup --verify
```

---

## 📋 技術的な説明

### なぜベクトルファイルから直接削除できないのか？

使用している**FAISSライブラリ**は、以下の理由で削除をサポートしていません：

```python
# FAISSインデックスの構造
index = faiss.IndexFlatIP(dim)
index.add(vectors)  # 追加は可能 ✅
# index.delete(idx)  # 削除メソッドは存在しない ❌
```

FAISSは高速検索のために最適化されており、削除操作は非効率になるため、設計上サポートされていません。

### 無視リストの仕組み

RAG検索時、以下の2つのフィルタリングが適用されます：

```python
# app/api/utils/RAG.py の該当部分
ignored_qa_ids = _load_global_qa_ignore()  # JSON無視リスト
ignored_hashes = _load_lang_hash_ignores(lang)  # ハッシュ無視リスト

for idx, similarity in ranked:
    # ...
    qa_id = meta[idx][0]
    payload_hash = _payload_hash(f"Q: {question_text}\nA: {answer_text}")
    
    # 無視リストに含まれる場合はスキップ
    if (qa_id in ignored_qa_ids) or (payload_hash in ignored_hashes):
        continue  # この結果は返さない
```

つまり、無視リストに追加すれば、ベクトルファイルに残っていても**検索結果には表示されません**。

### 完全再構築の処理内容

```python
# app/api/utils/RAG.py の generate_and_save_vectors()
def generate_and_save_vectors():
    # 1. データベースから現在の全QAを取得
    cursor.execute("SELECT id, question_id, answer_id FROM QA")
    qa_rows = cursor.fetchall()
    
    # 2. 各QAのembeddingを生成
    for qa_row in qa_rows:
        embedding = get_embedding(text)  # OpenAI API呼び出し
        lang_text_map[lang_code].append(embedding, meta, texts)
    
    # 3. 新しいFAISSインデックスを作成
    index = faiss.IndexFlatIP(vectors.shape[1])
    index.add(vectors)
    
    # 4. ファイルに保存（古いファイルを上書き）
    faiss.write_index(index, "vectors_ja.faiss")
```

完全再構築では、データベースに**現在存在するQAのみ**からベクトルを再生成するため、削除されたQAは自動的に除外されます。

---

## 🔍 現在の状態確認

```bash
# 孤立ベクトル数を確認
python3 check_vectors_simple.py

# 詳細情報を確認
python3 verify_vectors_detailed.py
```

---

## ❓ FAQ

### Q: 無視リストに追加するだけで本当に大丈夫？

**A**: はい、検索結果には表示されなくなります。ただし：
- ファイルサイズは変わりません（数MB程度）
- メモリ使用量も変わりません
- 完璧主義な場合は後で完全再構築をおすすめします

### Q: 無視リストに追加した後、元に戻せる？

**A**: はい、以下のファイルを編集するだけです：
```bash
# バックアップから復元
docker cp shigachat-uwsgi-1:/var/www/api/utils/vectors/vectors_ignore_qa.json.backup \
    ./vectors_ignore_qa.json
docker cp ./vectors_ignore_qa.json \
    shigachat-uwsgi-1:/var/www/api/utils/vectors/
```

### Q: 完全再構築中にエラーが出たら？

**A**: バックアップから復元できます：
```bash
# バックアップを確認
ls -lh vector_backups/

# 復元
docker cp vector_backups/vectors_backup_YYYYMMDD_HHMMSS.tar.gz \
    shigachat-uwsgi-1:/var/www/api/utils/
docker exec shigachat-uwsgi-1 sh -c "
    cd /var/www/api/utils &&
    rm -rf vectors &&
    tar xzf vectors_backup_YYYYMMDD_HHMMSS.tar.gz
"
```

---

## 📊 比較表

| 項目 | 無視リスト追加 | 完全再構築 |
|------|---------------|-----------|
| 実行時間 | 1分 | 5-10分 |
| 費用 | 無料 | $0.01-0.05 |
| リスク | 低 | 中 |
| ファイルサイズ削減 | ❌ | ✅ |
| メモリ削減 | ❌ | ✅ |
| 検索結果から除外 | ✅ | ✅ |
| 根本解決 | ❌ | ✅ |

---

**推奨アプローチ**: まず無視リスト追加 → 動作確認 → 後日完全再構築

**作成日**: 2025年10月16日

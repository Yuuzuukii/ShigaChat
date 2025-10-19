#!/usr/bin/env python3
"""
ベクトルインデックスとデータベースの整合性検証スクリプト

このスクリプトは以下を確認します：
1. ベクトルインデックスに存在するQA_IDがデータベースに存在するか
2. ignoreリストの整合性
3. ベクトルファイルの再構築方法の表示
"""

import os
import sys
import pickle
import json
from pathlib import Path

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent / "app"))

from database_utils import get_db_cursor, get_placeholder


VECTOR_DIR = Path("./app/api/utils/vectors")


def load_vector_meta(lang_code):
    """指定言語のベクトルメタデータを読み込み"""
    meta_path = VECTOR_DIR / f"vectors_{lang_code}.meta.pkl"
    if not meta_path.exists():
        return None
    
    with open(meta_path, "rb") as f:
        return pickle.load(f)


def load_vector_texts(lang_code):
    """指定言語のベクトルテキストデータを読み込み"""
    texts_path = VECTOR_DIR / f"vectors_{lang_code}.texts.pkl"
    if not texts_path.exists():
        return None
    
    with open(texts_path, "rb") as f:
        return pickle.load(f)


def load_ignore_qa_ids():
    """無視されるQA_IDのリストを読み込み"""
    ignore_path = VECTOR_DIR / "vectors_ignore_qa.json"
    if not ignore_path.exists():
        return set()
    
    with open(ignore_path, "r", encoding="utf-8") as f:
        return set(json.load(f))


def load_ignore_hashes(lang_code):
    """指定言語の無視ハッシュリストを読み込み"""
    hash_path = VECTOR_DIR / f"vectors_{lang_code}.ignore_hash.json"
    if not hash_path.exists():
        return set()
    
    with open(hash_path, "r", encoding="utf-8") as f:
        return set(json.load(f))


def get_all_qa_ids_from_db():
    """データベースから全てのQA_IDを取得"""
    with get_db_cursor() as (cursor, conn):
        cursor.execute("SELECT id, question_id, answer_id FROM QA")
        rows = cursor.fetchall()
        return {row['id']: (row['question_id'], row['answer_id']) for row in rows}


def verify_language_vectors(lang_code, db_qa_ids, ignored_qa_ids):
    """特定言語のベクトルインデックスを検証"""
    print(f"\n{'='*60}")
    print(f"言語: {lang_code.upper()}")
    print(f"{'='*60}")
    
    meta = load_vector_meta(lang_code)
    texts = load_vector_texts(lang_code)
    ignore_hashes = load_ignore_hashes(lang_code)
    
    if meta is None:
        print(f"⚠️  メタデータファイルが見つかりません")
        return
    
    if texts is None:
        print(f"⚠️  テキストファイルが見つかりません")
        return
    
    print(f"ベクトル総数: {len(meta)}")
    print(f"無視ハッシュ数: {len(ignore_hashes)}")
    
    # ベクトルインデックスに存在するが、DBに存在しないQAを検出
    orphaned_vectors = []
    
    for idx, (qa_id, question_id) in enumerate(meta):
        if qa_id is None:
            continue
            
        # DBに存在しないQA_ID
        if qa_id not in db_qa_ids:
            # 無視リストにも含まれていない場合は問題
            if qa_id not in ignored_qa_ids:
                question_text, answer_text, time_val = texts[idx] if idx < len(texts) else ("N/A", "N/A", None)
                orphaned_vectors.append({
                    'idx': idx,
                    'qa_id': qa_id,
                    'question_id': question_id,
                    'question_text': question_text[:50] + '...' if len(question_text) > 50 else question_text,
                    'answer_text': answer_text[:50] + '...' if len(answer_text) > 50 else answer_text,
                })
    
    if orphaned_vectors:
        print(f"\n⚠️  データベースに存在しないQAがベクトルに {len(orphaned_vectors)} 件見つかりました:")
        for v in orphaned_vectors[:10]:  # 最初の10件を表示
            print(f"  - インデックス: {v['idx']}, QA_ID: {v['qa_id']}, Question: {v['question_text']}")
        
        if len(orphaned_vectors) > 10:
            print(f"  ... 他 {len(orphaned_vectors) - 10} 件")
    else:
        print(f"✅ 全てのベクトルがデータベースと整合しています")


def main():
    print("=" * 60)
    print("ベクトルインデックス整合性検証")
    print("=" * 60)
    
    # データベースから全QA_IDを取得
    print("\n📊 データベースから QA データを取得中...")
    db_qa_ids = get_all_qa_ids_from_db()
    print(f"データベース内のQA総数: {len(db_qa_ids)}")
    
    # 無視リストを読み込み
    ignored_qa_ids = load_ignore_qa_ids()
    print(f"無視リスト内のQA_ID数: {len(ignored_qa_ids)}")
    
    # 各言語のベクトルを検証
    languages = ['ja', 'en', 'vi', 'zh', 'ko', 'pt', 'es', 'tl', 'id']
    
    for lang in languages:
        verify_language_vectors(lang, db_qa_ids, ignored_qa_ids)
    
    print("\n" + "=" * 60)
    print("ベクトルファイルの再構築方法")
    print("=" * 60)
    print("""
1. 完全再構築（推奨）:
   Pythonインタラクティブシェルから:
   
   >>> from app.api.utils.RAG import generate_and_save_vectors
   >>> generate_and_save_vectors()
   
   または、以下のコマンドで直接実行:
   
   python3 -c "import sys; sys.path.insert(0, 'app'); from api.utils.RAG import generate_and_save_vectors; generate_and_save_vectors()"

2. 既存ベクトルのバックアップ:
   
   cp -r app/api/utils/vectors app/api/utils/vectors_backup_$(date +%Y%m%d_%H%M%S)

3. ベクトルファイルの削除（再構築前）:
   
   rm -f app/api/utils/vectors/*.faiss
   rm -f app/api/utils/vectors/*.pkl
   rm -f app/api/utils/vectors/*.json

注意: 
- generate_and_save_vectors() は全てのQAペアを再処理し、新しいベクトルインデックスを作成します
- 処理には時間がかかる場合があります（QAの数に依存）
- 処理中はOpenAI APIが呼び出されるため、API使用料が発生します
""")


if __name__ == "__main__":
    main()

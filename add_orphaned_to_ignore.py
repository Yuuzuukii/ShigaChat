#!/usr/bin/env python3
"""
孤立ベクトルを無視リストに追加するスクリプト
データベースに存在しないQA_IDを自動的に検出して無視リストに追加します
"""

import sys
import pickle
import json
from pathlib import Path

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent / "app"))

from database_utils import get_db_cursor

VECTOR_DIR = Path("./app/api/utils/vectors")

def main():
    print("=" * 80)
    print("孤立ベクトルを無視リストに追加")
    print("=" * 80)
    
    # データベースから全QA_IDを取得
    print("\n📊 データベースからQAデータを取得中...")
    with get_db_cursor() as (cursor, conn):
        cursor.execute("SELECT id FROM QA")
        rows = cursor.fetchall()
        db_qa_ids = set(row['id'] for row in rows)
    
    print(f"✓ データベース内のQA総数: {len(db_qa_ids)}")
    
    # 現在の無視リストを読み込み
    ignore_path = VECTOR_DIR / "vectors_ignore_qa.json"
    ignored_qa_ids = set()
    if ignore_path.exists():
        with open(ignore_path, "r", encoding="utf-8") as f:
            ignored_qa_ids = set(json.load(f))
    
    print(f"✓ 現在の無視リスト: {len(ignored_qa_ids)} 件")
    
    # 全言語のベクトルから孤立QA_IDを収集
    languages = ['ja', 'en', 'vi', 'zh', 'ko', 'pt', 'es', 'tl', 'id']
    all_orphaned = set()
    
    print("\n🔍 孤立ベクトルを検出中...")
    for lang in languages:
        meta_path = VECTOR_DIR / f"vectors_{lang}.meta.pkl"
        if not meta_path.exists():
            continue
        
        with open(meta_path, "rb") as f:
            meta = pickle.load(f)
        
        orphaned_in_lang = set()
        for qa_id, _ in meta:
            if qa_id and qa_id not in db_qa_ids and qa_id not in ignored_qa_ids:
                orphaned_in_lang.add(qa_id)
                all_orphaned.add(qa_id)
        
        if orphaned_in_lang:
            print(f"  {lang.upper()}: {len(orphaned_in_lang)} 件の孤立ベクトル")
    
    if not all_orphaned:
        print("\n✅ 孤立ベクトルは見つかりませんでした！")
        return
    
    print(f"\n⚠️  合計 {len(all_orphaned)} 件の孤立QA_IDを検出しました")
    print(f"孤立QA_ID（一部）: {sorted(list(all_orphaned))[:20]}...")
    
    # 確認
    print("\nこれらのQA_IDを無視リストに追加します。")
    response = input("続行しますか？ (y/N): ").strip().lower()
    
    if response != 'y':
        print("キャンセルされました")
        return
    
    # 無視リストを更新
    new_ignore_list = sorted(list(ignored_qa_ids | all_orphaned))
    
    # バックアップ
    if ignore_path.exists():
        backup_path = VECTOR_DIR / f"vectors_ignore_qa.json.backup"
        import shutil
        shutil.copy(ignore_path, backup_path)
        print(f"\n✓ バックアップ作成: {backup_path}")
    
    # 保存
    with open(ignore_path, "w", encoding="utf-8") as f:
        json.dump(new_ignore_list, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 無視リストを更新しました！")
    print(f"   更新前: {len(ignored_qa_ids)} 件")
    print(f"   追加: {len(all_orphaned)} 件")
    print(f"   更新後: {len(new_ignore_list)} 件")
    print(f"\n📝 ファイル: {ignore_path}")
    
    print("\n" + "=" * 80)
    print("完了!")
    print("=" * 80)
    print("""
次のステップ:
1. アプリケーションを再起動（変更を反映）:
   docker-compose restart uwsgi

2. RAG検索をテストして動作確認

3. 時間があるときにベクトルファイルの完全再構築を検討:
   ./rebuild_vectors.sh --backup --verify
""")

if __name__ == "__main__":
    main()

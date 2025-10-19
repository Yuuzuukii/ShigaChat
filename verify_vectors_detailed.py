#!/usr/bin/env python3
"""
ベクトルとDBの整合性を詳細に検証
"""

import sys
import pickle
import json
from pathlib import Path

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent / "app"))

try:
    from database_utils import get_db_cursor
    
    VECTOR_DIR = Path("./app/api/utils/vectors")
    
    def main():
        print("=" * 80)
        print("ベクトルインデックスとデータベースの整合性検証")
        print("=" * 80)
        
        # データベースから全QA_IDを取得
        print("\n📊 データベースからQAデータを取得中...")
        with get_db_cursor() as (cursor, conn):
            cursor.execute("SELECT id, question_id, answer_id FROM QA")
            rows = cursor.fetchall()
            db_qa_ids = {row['id']: (row['question_id'], row['answer_id']) for row in rows}
        
        print(f"✓ データベース内のQA総数: {len(db_qa_ids)}")
        print(f"✓ QA_ID範囲: {min(db_qa_ids.keys()) if db_qa_ids else 'N/A'} - {max(db_qa_ids.keys()) if db_qa_ids else 'N/A'}")
        
        # 無視リストを読み込み
        ignore_path = VECTOR_DIR / "vectors_ignore_qa.json"
        ignored_qa_ids = set()
        if ignore_path.exists():
            with open(ignore_path, "r", encoding="utf-8") as f:
                ignored_qa_ids = set(json.load(f))
        
        print(f"✓ 無視リスト内のQA_ID数: {len(ignored_qa_ids)}")
        
        languages = ['ja', 'en', 'vi', 'zh', 'ko', 'pt', 'es', 'tl', 'id']
        
        all_orphaned = {}
        
        for lang in languages:
            meta_path = VECTOR_DIR / f"vectors_{lang}.meta.pkl"
            texts_path = VECTOR_DIR / f"vectors_{lang}.texts.pkl"
            hash_path = VECTOR_DIR / f"vectors_{lang}.ignore_hash.json"
            
            if not meta_path.exists():
                continue
            
            with open(meta_path, "rb") as f:
                meta = pickle.load(f)
            
            with open(texts_path, "rb") as f:
                texts = pickle.load(f)
            
            ignore_hashes = set()
            if hash_path.exists():
                with open(hash_path, "r", encoding="utf-8") as f:
                    ignore_hashes = set(json.load(f))
            
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
                            'question': question_text[:80] + '...' if len(question_text) > 80 else question_text,
                            'answer': answer_text[:80] + '...' if len(answer_text) > 80 else answer_text,
                        })
            
            if orphaned_vectors:
                all_orphaned[lang] = orphaned_vectors
        
        # 結果表示
        print("\n" + "=" * 80)
        print("検証結果")
        print("=" * 80)
        
        if all_orphaned:
            print("\n⚠️  データベースに存在しないQAがベクトルインデックスに見つかりました:\n")
            
            for lang, orphaned in all_orphaned.items():
                print(f"\n【{lang.upper()}】: {len(orphaned)} 件の孤立ベクトル")
                print("-" * 80)
                
                for v in orphaned[:5]:  # 最初の5件を表示
                    print(f"  QA_ID: {v['qa_id']}")
                    print(f"    Q: {v['question']}")
                    print(f"    A: {v['answer']}")
                    print()
                
                if len(orphaned) > 5:
                    print(f"  ... 他 {len(orphaned) - 5} 件\n")
            
            print("\n" + "=" * 80)
            print("⚠️  問題の原因:")
            print("=" * 80)
            print("""
1. QAが削除されたが、ベクトルインデックスから削除されていない
2. ignore機能が正しく動作していない可能性
3. ベクトルインデックスとDBの同期が取れていない

推奨される対処法:
1. ベクトルインデックスの完全再構築
2. ignore機能の見直し
""")
        else:
            print("\n✅ 全ての言語で、ベクトルインデックスとデータベースは整合しています")
        
        print("\n" + "=" * 80)
        print("ベクトルインデックスの再構築方法")
        print("=" * 80)
        print("""
【方法1】完全再構築（推奨）
--------------------------------------------------
Dockerコンテナ内で以下を実行:

docker exec -it shigachat-app-1 python3 -c "
import sys
sys.path.insert(0, '/app')
from api.utils.RAG import generate_and_save_vectors
generate_and_save_vectors()
"

【方法2】Pythonシェルから実行
--------------------------------------------------
docker exec -it shigachat-app-1 python3

>>> import sys
>>> sys.path.insert(0, '/app')
>>> from api.utils.RAG import generate_and_save_vectors
>>> generate_and_save_vectors()

【バックアップ（推奨）】
--------------------------------------------------
再構築前にベクトルファイルをバックアップ:

docker exec shigachat-app-1 sh -c "
    cd /app/api/utils &&
    tar czf vectors_backup_$(date +%Y%m%d_%H%M%S).tar.gz vectors/
"

【注意事項】
--------------------------------------------------
- 処理には時間がかかる場合があります（QA数に依存）
- OpenAI APIが呼び出されるため、API使用料が発生します
- 処理中はサービスの応答が遅くなる可能性があります
""")
        
except Exception as e:
    print(f"エラー: {e}")
    import traceback
    traceback.print_exc()


if __name__ == "__main__":
    main()

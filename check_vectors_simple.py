#!/usr/bin/env python3



#---------------------------ベクトルファイル作り直しか！！？-----------------------



"""
簡易ベクトル検証スクリプト - Dockerコンテナ内で実行
"""

import pickle
import json
from pathlib import Path

VECTOR_DIR = Path("./app/api/utils/vectors")

def check_vectors():
    print("=" * 60)
    print("ベクトルファイル検証")
    print("=" * 60)
    
    languages = ['ja', 'en', 'vi', 'zh', 'ko', 'pt', 'es', 'tl', 'id']
    
    # 無視リストを読み込み
    ignore_path = VECTOR_DIR / "vectors_ignore_qa.json"
    ignored_qa_ids = set()
    if ignore_path.exists():
        with open(ignore_path, "r", encoding="utf-8") as f:
            ignored_qa_ids = set(json.load(f))
    
    print(f"\n無視リスト内のQA_ID数: {len(ignored_qa_ids)}")
    print(f"無視されているQA_ID: {sorted(list(ignored_qa_ids))}")
    
    for lang in languages:
        meta_path = VECTOR_DIR / f"vectors_{lang}.meta.pkl"
        texts_path = VECTOR_DIR / f"vectors_{lang}.texts.pkl"
        hash_path = VECTOR_DIR / f"vectors_{lang}.ignore_hash.json"
        
        if not meta_path.exists():
            continue
            
        with open(meta_path, "rb") as f:
            meta = pickle.load(f)
        
        ignore_hashes = set()
        if hash_path.exists():
            with open(hash_path, "r", encoding="utf-8") as f:
                ignore_hashes = set(json.load(f))
        
        qa_ids = [qa_id for qa_id, _ in meta if qa_id is not None]
        unique_qa_ids = set(qa_ids)
        
        print(f"\n{lang.upper()}:")
        print(f"  ベクトル数: {len(meta)}")
        print(f"  ユニークQA_ID数: {len(unique_qa_ids)}")
        print(f"  無視ハッシュ数: {len(ignore_hashes)}")
        print(f"  QA_ID範囲: {min(qa_ids) if qa_ids else 'N/A'} - {max(qa_ids) if qa_ids else 'N/A'}")


if __name__ == "__main__":
    check_vectors()

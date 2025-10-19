#!/bin/bash
#
# 孤立ベクトルを無視リストに追加する簡易スクリプト
# Docker環境で直接実行可能
#

set -e

CONTAINER_NAME="shigachat-uwsgi-1"

echo "=================================================="
echo "  孤立ベクトルを無視リストに追加"
echo "=================================================="
echo ""

# コンテナの存在確認
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "❌ エラー: コンテナ '$CONTAINER_NAME' が見つかりません"
    exit 1
fi

echo "✓ コンテナ確認: $CONTAINER_NAME"
echo ""

# 現在の状態を確認
echo "📊 現在の状態:"
docker exec "$CONTAINER_NAME" python3 -c "
import sys
import pickle
import json
sys.path.insert(0, '/var/www')
from database_utils import get_db_cursor

# DB count
with get_db_cursor() as (cursor, conn):
    cursor.execute('SELECT COUNT(*) as cnt FROM QA')
    db_count = cursor.fetchone()['cnt']
    cursor.execute('SELECT id FROM QA')
    db_qa_ids = set(row['id'] for row in cursor.fetchall())

# Current ignore list
try:
    with open('./api/utils/vectors/vectors_ignore_qa.json', 'r') as f:
        ignored = set(json.load(f))
except:
    ignored = set()

# Vector count
try:
    with open('./api/utils/vectors/vectors_ja.meta.pkl', 'rb') as f:
        meta = pickle.load(f)
        vector_count = len(meta)
        orphaned = set()
        for qa_id, _ in meta:
            if qa_id and qa_id not in db_qa_ids and qa_id not in ignored:
                orphaned.add(qa_id)
except:
    vector_count = 0
    orphaned = set()

print(f'  データベースQA: {db_count} 件')
print(f'  ベクトル数: {vector_count} 件')
print(f'  現在の無視リスト: {len(ignored)} 件')
print(f'  孤立ベクトル: {len(orphaned)} 件')
"

echo ""
read -p "孤立ベクトルを無視リストに追加しますか？ (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "キャンセルされました"
    exit 0
fi

# 無視リストに追加
echo ""
echo "🔄 無視リストを更新中..."

docker exec "$CONTAINER_NAME" python3 << 'EOF'
import sys
import pickle
import json
import shutil
from pathlib import Path
sys.path.insert(0, '/var/www')
from database_utils import get_db_cursor

# Get DB QA IDs
with get_db_cursor() as (cursor, conn):
    cursor.execute('SELECT id FROM QA')
    db_qa_ids = set(row['id'] for row in cursor.fetchall())

# Current ignore list
ignore_path = Path('./api/utils/vectors/vectors_ignore_qa.json')
try:
    with open(ignore_path, 'r') as f:
        ignored = set(json.load(f))
except:
    ignored = set()

# Find all orphaned QA IDs from all languages
languages = ['ja', 'en', 'vi', 'zh', 'ko', 'pt', 'es', 'tl', 'id']
all_orphaned = set()

for lang in languages:
    meta_path = Path(f'./api/utils/vectors/vectors_{lang}.meta.pkl')
    if not meta_path.exists():
        continue
    
    with open(meta_path, 'rb') as f:
        meta = pickle.load(f)
    
    for qa_id, _ in meta:
        if qa_id and qa_id not in db_qa_ids and qa_id not in ignored:
            all_orphaned.add(qa_id)

if not all_orphaned:
    print('✅ 孤立ベクトルは見つかりませんでした')
    sys.exit(0)

# Backup
if ignore_path.exists():
    backup_path = Path('./api/utils/vectors/vectors_ignore_qa.json.backup')
    shutil.copy(ignore_path, backup_path)
    print(f'✓ バックアップ作成: {backup_path}')

# Update ignore list
new_ignore_list = sorted(list(ignored | all_orphaned))
with open(ignore_path, 'w') as f:
    json.dump(new_ignore_list, f, ensure_ascii=False, indent=2)

print(f'\n✅ 無視リストを更新しました！')
print(f'   更新前: {len(ignored)} 件')
print(f'   追加: {len(all_orphaned)} 件')
print(f'   更新後: {len(new_ignore_list)} 件')
print(f'\n追加されたQA_ID（一部）: {sorted(list(all_orphaned))[:20]}')
if len(all_orphaned) > 20:
    print(f'... 他 {len(all_orphaned) - 20} 件')
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "=================================================="
    echo "  ✅ 完了"
    echo "=================================================="
    echo ""
    echo "次のステップ:"
    echo "  1. アプリケーションを再起動して変更を反映:"
    echo "     docker-compose restart uwsgi"
    echo ""
    echo "  2. RAG検索をテストして動作確認"
    echo ""
    echo "  3. 時間があるときにベクトルファイルの完全再構築を実行:"
    echo "     ./rebuild_vectors.sh --backup --verify"
    echo ""
else
    echo ""
    echo "❌ エラーが発生しました"
    exit 1
fi

#!/bin/bash
#
# ベクトルインデックス再構築スクリプト
# Usage: ./rebuild_vectors.sh [--backup] [--verify]
#

set -e

CONTAINER_NAME="shigachat-uwsgi-1"
BACKUP_DIR="./vector_backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=================================================="
echo "  ベクトルインデックス再構築ツール"
echo "=================================================="
echo ""

# コンテナの存在確認
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "❌ エラー: コンテナ '$CONTAINER_NAME' が見つかりません"
    echo "   docker ps で実行中のコンテナを確認してください"
    exit 1
fi

echo "✓ コンテナ確認: $CONTAINER_NAME"

# バックアップオプション
if [[ "$*" == *"--backup"* ]] || [[ "$*" == *"-b"* ]]; then
    echo ""
    echo "📦 バックアップを作成中..."
    mkdir -p "$BACKUP_DIR"
    
    # コンテナ内でtarアーカイブを作成
    docker exec "$CONTAINER_NAME" sh -c "
        cd /var/www/api/utils &&
        tar czf vectors_backup_${TIMESTAMP}.tar.gz vectors/
    " || {
        echo "⚠️  警告: バックアップ作成に失敗しました"
    }
    
    # ホストにコピー
    docker cp "$CONTAINER_NAME:/var/www/api/utils/vectors_backup_${TIMESTAMP}.tar.gz" \
        "$BACKUP_DIR/" 2>/dev/null && {
        echo "✓ バックアップ保存: $BACKUP_DIR/vectors_backup_${TIMESTAMP}.tar.gz"
        
        # コンテナ内のバックアップを削除
        docker exec "$CONTAINER_NAME" rm -f \
            "/var/www/api/utils/vectors_backup_${TIMESTAMP}.tar.gz" 2>/dev/null
    } || {
        echo "⚠️  警告: バックアップのコピーに失敗しました"
    }
fi

# 現在の状態を表示
echo ""
echo "📊 現在の状態:"
docker exec "$CONTAINER_NAME" python3 -c "
import sys
import pickle
sys.path.insert(0, '/var/www')
from database_utils import get_db_cursor

# DB count
with get_db_cursor() as (cursor, conn):
    cursor.execute('SELECT COUNT(*) as cnt FROM QA')
    db_count = cursor.fetchone()['cnt']

# Vector count
try:
    with open('./api/utils/vectors/vectors_ja.meta.pkl', 'rb') as f:
        vector_count = len(pickle.load(f))
except:
    vector_count = 0

print(f'  データベース内のQA: {db_count} 件')
print(f'  ベクトルインデックス: {vector_count} 件')
print(f'  差分: {vector_count - db_count} 件')
"

# 確認プロンプト
echo ""
read -p "ベクトルインデックスを再構築しますか？ (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "キャンセルされました"
    exit 0
fi

# 再構築実行
echo ""
echo "🔄 ベクトルインデックスを再構築中..."
echo "   (この処理には数分かかる場合があります)"
echo ""

docker exec -i "$CONTAINER_NAME" python3 << 'EOF'
import sys
sys.path.insert(0, '/var/www')
from api.utils.RAG import generate_and_save_vectors

print("再構築を開始します...")
try:
    generate_and_save_vectors()
    print("\n✅ 再構築が完了しました！")
except Exception as e:
    print(f"\n❌ エラー: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "=================================================="
    echo "  ✅ 再構築完了"
    echo "=================================================="
    
    # 検証オプション
    if [[ "$*" == *"--verify"* ]] || [[ "$*" == *"-v"* ]]; then
        echo ""
        echo "🔍 検証中..."
        docker exec "$CONTAINER_NAME" python3 -c "
import sys
import pickle
sys.path.insert(0, '/var/www')
from database_utils import get_db_cursor

# DB count
with get_db_cursor() as (cursor, conn):
    cursor.execute('SELECT COUNT(*) as cnt FROM QA')
    db_count = cursor.fetchone()['cnt']

# Vector count
with open('./api/utils/vectors/vectors_ja.meta.pkl', 'rb') as f:
    vector_count = len(pickle.load(f))

print(f'  データベース内のQA: {db_count} 件')
print(f'  ベクトルインデックス: {vector_count} 件')

if vector_count == db_count:
    print('  ✅ 整合性OK')
else:
    print(f'  ⚠️  差分: {vector_count - db_count} 件')
"
    fi
    
    echo ""
    echo "次の手順:"
    echo "  1. アプリケーションの動作確認"
    echo "  2. RAG検索のテスト"
    echo "  3. 問題があればバックアップからの復元:"
    if [[ "$*" == *"--backup"* ]] || [[ "$*" == *"-b"* ]]; then
        echo "     tar xzf $BACKUP_DIR/vectors_backup_${TIMESTAMP}.tar.gz -C app/api/utils/"
    fi
else
    echo ""
    echo "=================================================="
    echo "  ❌ 再構築失敗"
    echo "=================================================="
    echo "ログを確認してください: docker logs $CONTAINER_NAME"
    exit 1
fi

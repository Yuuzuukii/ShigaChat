"""
ローカルEmbeddingモデル実装例
OpenAI APIの代わりにSentence Transformersを使用
"""

from sentence_transformers import SentenceTransformer
import numpy as np

# グローバルでモデルを読み込み（起動時に1回だけ）
_LOCAL_MODEL = None

def get_local_model():
    """遅延読み込み: 初回アクセス時のみモデルをロード"""
    global _LOCAL_MODEL
    if _LOCAL_MODEL is None:
        print("ローカルEmbeddingモデルを読み込み中...")
        # 多言語対応の軽量モデル
        _LOCAL_MODEL = SentenceTransformer('intfloat/multilingual-e5-small')
        print("モデル読み込み完了")
    return _LOCAL_MODEL

def get_embedding_local(text: str):
    """
    ローカルモデルでEmbeddingを生成
    OpenAI APIの代替
    """
    model = get_local_model()
    # prefix推奨（E5モデルの場合）
    prefixed_text = f"query: {text}"
    embedding = model.encode(prefixed_text, convert_to_numpy=True)
    return embedding.tolist()

# 既存のget_embedding関数を置き換える場合
def get_embedding(text: str):
    """
    環境変数でOpenAI/ローカルを切り替え
    """
    import os
    use_local = os.getenv("USE_LOCAL_EMBEDDINGS", "false").lower() == "true"
    
    if use_local:
        return get_embedding_local(text)
    else:
        # 既存のOpenAI実装
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        try:
            resp = client.embeddings.create(
                input=[text], 
                model="text-embedding-3-small"
            )
            return resp.data[0].embedding
        except Exception as e:
            raise RuntimeError(f"Embedding取得に失敗: {e}") from e

# requirements.txtに追加が必要:
# sentence-transformers==2.2.2

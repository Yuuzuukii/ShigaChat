# RAG 再設計案

## ディレクトリ/責務
- `api/utils/vector_store.py`
  - ベクトル生成・更新・保存・無効化の低レベル操作
- `api/utils/search.py`
  - 言語判定・埋め込み・検索クエリ生成・Faiss検索
- `api/utils/prompt_builder.py`
  - 言語別プロンプト構築
- `api/utils/generator.py`
  - LLM呼び出し・レスポンス整形（引用タグ除去など）
- `api/utils/rag_orchestrator.py`
  - RAG統合フロー＋reactiveとのルーティング
- （任意）`api/utils/ignore_list.py`
  - 無効化リスト操作を分離したい場合

## モジュール別に実装する関数/クラス

### vector_store.py
- `vector_dir() -> Path`
- `ensure_index(lang_code: str, dim: int) -> faiss.Index`
- `load_sidecars(lang_code: str) -> tuple[list, list]`  # meta, texts
- `save_sidecars(lang_code: str, index, meta, texts) -> None`
- `build_all_vectors() -> dict`  # 総件数や言語ごとの数を返すとなお良い
- `append_qa(question_id: int, answer_id: int, languages: list[str] | None = None) -> int`
- `ignore_payloads(question_id: int, answer_id: int, languages: list[str] | None = None) -> int`
- `add_qa_id_to_global_ignore(qa_id: int) -> None`

### search.py
- `detect_lang(text: str) -> str`  # ALLOWED_ISO内チェック含む
- `embed(text: str) -> np.ndarray`
- `make_search_query(question: str, history_qa: list[tuple[str, str]] | None) -> str`
- `retrieve(question: str, history_qa: list[tuple[str, str]] | None, similarity_threshold=0.3, top_k=10) -> list[Result]`
- `Result` データクラス: `question`, `answer`, `similarity`, `question_id`, `category_id`, `answer_time`, `lang`, `time`

### prompt_builder.py
- `build_prompt(lang: str, question_text: str, references: list[dict], history_qa: list[tuple[str, str]]) -> str`
- 内部に言語別ビルダーのマップ（ja/en/vi/zh/ko/pt/es/tl/id）

### generator.py
- `generate_answer(prompt: str, model="gpt-5-nano", reasoning="minimal") -> tuple[str, str]`  # text, model_used
- `parse_answer_json(raw: str, fallback_refs: list[str]) -> dict`
- `strip_citations(answer_text: str) -> str`  # `[S1]`などを除去し段落を整形

### rag_orchestrator.py
- `answer_with_rag(question_text: str, history_qa: list[tuple[str, str]], similarity_threshold=0.3, max_history_in_prompt=6, model="gpt-5-nano", reasoning_effort="minimal") -> dict`
  - search.retrieve → prompt_builder.build_prompt → generator.generate_answer → 整形・参照抽出
- `orchestrate(...) -> dict`
  - reactiveハンドラ呼び出し → route_to_rag 以外は即返却 → RAGフローへ

### ignore_list.py（オプション）
- `_payload_hash(text: str) -> str`
- `load_global_ignore() / save_global_ignore()`
- `load_lang_hash_ignores(lang_code) / save_lang_hash_ignores(lang_code)`
- ラッパー: `add_payload_hash(lang_code, payload_hash)` など

## データ/ファイル構成
- ベクトルとサイドカー: `api/utils/vectors/vectors_{lang}.faiss|.meta.pkl|.texts.pkl`
- 無効化リスト: `api/utils/vectors/vectors_ignore_qa.json`, `vectors_{lang}.ignore_hash.json`

## 依存関係の整理ポイント
- DBアクセス系は `database_utils.py` に集約（placeholder生成/カーソル取得）
- OpenAIクライアント生成は1か所（`generator.py` or `search.py`）に寄せ、他はインジェクション可能にするとテスト容易
- 言語判定と埋め込みは `search.py` に集約（他ファイルは依存注入で差し替え可）

## 移行ステップ（簡潔）
1. `vector_store.py` を先に切り出し、既存関数をラップ移動。
2. `search.py` に `detect_lang`, `embed`, `make_search_query`, `retrieve` を移動。
3. プロンプトとLLM周りを `prompt_builder.py`, `generator.py` へ分離。
4. `answer_with_rag` と `orchestrate` を `rag_orchestrator.py` へ移して呼び出し元を差し替え。
5. 旧 `RAG.py` は段階的に空にし、最終的に削除。

## テスト観点
- 言語判定: 短文/未対応言語での例外
- ベクトル次元ミスマッチ時のスキップ挙動
- ignoreリストが効いているか（同一ペイロードで検索結果から除外される）
- appendとfull-buildが同一結果を返すかの整合性
- 参照なし時のフォールバック回答が動くか

## 追加: ベクトルのみPostgreSQLに格納する設計

### 前提
- PostgreSQL 15/16 + `pgvector` 拡張（`CREATE EXTENSION IF NOT EXISTS vector;`）。
- 既存のメタデータやアプリはMySQLのままでも可だが、埋め込みだけPostgreSQLに集約。
- 接続情報は環境変数で管理（例: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`）。

### スキーマ案（PostgreSQL）
```sql
CREATE TABLE qa_embedding (
  id           BIGSERIAL PRIMARY KEY,
  qa_id        BIGINT NOT NULL,
  question_id  BIGINT NOT NULL,
  lang         TEXT NOT NULL,
  dim          INT  NOT NULL,
  embedding    vector NOT NULL,
  category_id  BIGINT,
  question_ts  TIMESTAMPTZ,
  answer_ts    TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_qa_embedding_lang ON qa_embedding(lang);
CREATE INDEX idx_qa_embedding_category ON qa_embedding(category_id);
-- 類似検索用 HNSW インデックス（pgvector 0.6+）
CREATE INDEX idx_qa_embedding_vec_hnsw ON qa_embedding USING hnsw (embedding vector_cosine_ops);
```
- 距離指標: 既存コードは内積＋正規化(L2)。同等にするなら `vector_cosine_ops` を使用し、保存前にL2正規化する。
- `dim` はモデル変更検知に利用。

### 役割ごとの変更
- `vector_store.py`
  - 書き込み先をPostgreSQLに変更。
  - `save_sidecars`/`load_sidecars` 相当は不要（FAISSサイドカー削減）。必要ならキャッシュ目的で残す。
  - 新規関数例:
    - `upsert_embedding(record: EmbeddingRecord) -> None`
    - `delete_embedding_by_qa(qa_id: int) -> int`
    - `fetch_embeddings(filter...) -> list[EmbeddingRecord]`（テストや再計算用）
- `search.py`
  - Faiss読み込みをやめ、SQLでKNN検索。
  - 例: `SELECT *, embedding <=> $1 AS distance FROM qa_embedding WHERE lang=$2 ORDER BY embedding <=> $1 LIMIT 10;`
  - 閾値判定: cosine距離の場合、小さいほど近い。内積スコア互換にしたい場合は `1 - cosine_distance` を類似度として返す。
- `generator.py` / `prompt_builder.py`
  - 変更なし。
- `rag_orchestrator.py`
  - 検索結果の`similarity`計算を、`distance`から変換するよう修正（例: `similarity = 1 - distance`）。

### EmbeddingRecord データクラス例
```python
@dataclass
class EmbeddingRecord:
    qa_id: int
    question_id: int
    lang: str
    dim: int
    embedding: np.ndarray  # 1D float32
    category_id: int | None = None
    question_ts: datetime | None = None
    answer_ts: datetime | None = None
```

### フローの変化
1. 埋め込み生成（question+answer結合 → L2正規化）
2. `upsert_embedding` で PostgreSQL に保存
3. 検索時: `detect_lang` → `embed(query)` → `SELECT ... ORDER BY embedding <=> $1 LIMIT k`
4. `distance` を `similarity = 1 - distance` に変換し、閾値でフィルタ

### マイグレーション手順（段階）
1. PostgreSQL を用意し `pgvector` を有効化。
2. 上記テーブルとインデックスを作成。
3. 既存の `generate_and_save_vectors` を Postgres 書き込み版に置き換え、全データを投入。
4. `rag` 検索実装を Postgres KNN に切り替え（FAISSロードを削除）。
5. 動作確認後、不要になったFAISSファイル/ignoreファイルを削除または残す（キャッシュ目的なら残置）。

### 運用メモ
- `pgvector` HNSWはメモリ使用量が増えるため、`maintenance_work_mem` を適切に設定。
- バキューム/アナライズを定期実行。大規模データでは分割テーブルやlang別パーティションも検討。
- モデル更新時は `dim` チェックで不整合を検知し、一括再計算ジョブを走らせる。
```

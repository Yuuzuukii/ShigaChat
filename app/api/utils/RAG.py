import os
import pickle
import json
import hashlib
from pathlib import Path
from collections import defaultdict
from typing import Optional, List, Dict, Tuple, Any
import re
import dotenv
import numpy as np
import faiss
from tqdm import tqdm
from database_utils import get_db_cursor, get_placeholder
from openai import OpenAI
from lingua import LanguageDetectorBuilder

# ----------------------------------------------------------------------------
# Errors
# ----------------------------------------------------------------------------

class LanguageDetectionError(ValueError):
    """言語を特定できなかった（短文/ノイズなど）"""


class UnsupportedLanguageError(ValueError):
    """対応外の言語が検出された（許可: JA/EN/VI/ZH/KO/PT/ES/TL/ID）"""

# ----------------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------------

dotenv.load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

VECTOR_DIR = Path("./api/utils/vectors")
VECTOR_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_ISO = {"ja", "en", "vi", "zh", "ko", "pt", "es", "tl", "id"}

# ----------------------------------------------------------------------------
# Lang detection
# ----------------------------------------------------------------------------

_LINGUA_ALL = (
    LanguageDetectorBuilder
    .from_all_languages()
    .with_preloaded_language_models()
    .build()
)

def detect_lang(text: str) -> str:
    lang = _LINGUA_ALL.detect_language_of(text)
    if lang is None or lang.iso_code_639_1 is None:
        raise LanguageDetectionError("言語を特定できませんでした。")
    iso = lang.iso_code_639_1.name.lower()

    # zh-cn, zh-tw を zh に寄せる
    if iso.startswith("zh"):
        iso = "zh"
    if iso == "jp":
        iso = "ja"

    if iso not in ALLOWED_ISO:
        raise UnsupportedLanguageError("maybe question is too short")

    return iso

# ----------------------------------------------------------------------------
# Embeddings
# ----------------------------------------------------------------------------

def get_embedding(text: str):
    try:
        resp = client.embeddings.create(input=[text], model="text-embedding-3-small")
    except Exception as e:  # 必要なら型を絞る
        raise RuntimeError(f"Embedding取得に失敗: {e}") from e
    return resp.data[0].embedding

# ----------------------------------------------------------------------------
# DB helpers
# ----------------------------------------------------------------------------

def get_language_map() -> Dict[int, str]:
    """languageテーブルから {id: code(lower)} を取得"""
    with get_db_cursor() as (cursor, conn):
        cursor.execute("SELECT id, code FROM language")
        rows = cursor.fetchall()
        return {row['id']: row['code'].lower() for row in rows}

# ----------------------------------------------------------------------------
# Incremental update (append) helpers
# ----------------------------------------------------------------------------

def _ensure_index_for_lang(dim: int, lang_code: str) -> Optional[faiss.IndexFlatIP]:
    """Load existing FAISS index for a language or create a new one with given dim.

    If an existing index is found but its dimension mismatches, return None to avoid corruption.
    """
    base_path = VECTOR_DIR / f"vectors_{lang_code}"
    faiss_path = base_path.with_suffix(".faiss")
    if faiss_path.exists():
        index = faiss.read_index(str(faiss_path))
        try:
            if index.d != dim:
                # Dimension changed (likely model changed). Skip to avoid breaking existing index.
                return None
        except Exception:
            return None
    else:
        index = faiss.IndexFlatIP(dim)
    return index

def _load_sidecar_lists(lang_code: str) -> Tuple[list, list]:
    """Load meta/texts sidecar files (return empty lists if missing)."""
    base_path = VECTOR_DIR / f"vectors_{lang_code}"
    meta_path = base_path.with_suffix(".meta.pkl")
    texts_path = base_path.with_suffix(".texts.pkl")

    meta: list = []
    texts: list = []
    if meta_path.exists():
        try:
            with open(meta_path, "rb") as f:
                meta = pickle.load(f) or []
        except Exception:
            meta = []
    if texts_path.exists():
        try:
            with open(texts_path, "rb") as f:
                texts = pickle.load(f) or []
        except Exception:
            texts = []
    return meta, texts

def _save_index_and_sidecars(index: faiss.IndexFlatIP, meta: list, texts: list, lang_code: str) -> None:
    base_path = VECTOR_DIR / f"vectors_{lang_code}"
    faiss_path = base_path.with_suffix(".faiss")
    meta_path = base_path.with_suffix(".meta.pkl")
    texts_path = base_path.with_suffix(".texts.pkl")
    faiss.write_index(index, str(faiss_path))
    with open(meta_path, "wb") as f:
        pickle.dump(meta, f)
    with open(texts_path, "wb") as f:
        pickle.dump(texts, f)

# ----------------------------------------------------------------------------
# Ignore lists (masking old/deleted entries without rebuild)
# ----------------------------------------------------------------------------

_GLOBAL_QA_IGNORE = VECTOR_DIR / "vectors_ignore_qa.json"  # [qa_id, ...]

def _load_global_qa_ignore() -> set:
    if _GLOBAL_QA_IGNORE.exists():
        try:
            with open(_GLOBAL_QA_IGNORE, "r", encoding="utf-8") as f:
                return set(json.load(f) or [])
        except Exception:
            return set()
    return set()

def _save_global_qa_ignore(s: set) -> None:
    with open(_GLOBAL_QA_IGNORE, "w", encoding="utf-8") as f:
        json.dump(sorted(list(s)), f, ensure_ascii=False)

def add_qa_id_to_ignore(qa_id: int) -> None:
    s = _load_global_qa_ignore()
    s.add(int(qa_id))
    _save_global_qa_ignore(s)

def _payload_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def _lang_hash_path(lang_code: str) -> Path:
    return VECTOR_DIR / f"vectors_{lang_code}.ignore_hash.json"

def _load_lang_hash_ignores(lang_code: str) -> set:
    p = _lang_hash_path(lang_code)
    if p.exists():
        try:
            with open(p, "r", encoding="utf-8") as f:
                return set(json.load(f) or [])
        except Exception:
            return set()
    return set()

def _save_lang_hash_ignores(lang_code: str, s: set) -> None:
    p = _lang_hash_path(lang_code)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(sorted(list(s)), f, ensure_ascii=False)

def ignore_current_vectors_for_qa_languages(question_id: int, answer_id: int, language_codes: list = None) -> int:
    """Record hash ignores for current QA payloads for specific languages only.

    Args:
        question_id: The question ID
        answer_id: The answer ID
        language_codes: List of language codes to ignore (e.g., ['ja', 'en']). If None, ignores all languages.

    Returns the number of language hashes added.
    """
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        LANGUAGE_MAP = get_language_map()  # {id: 'ja', ...}
        
        # Filter to only specified languages if provided
        if language_codes is not None:
            language_codes_set = set(language_codes)
            filtered_language_map = {lang_id: lang_code for lang_id, lang_code in LANGUAGE_MAP.items() 
                                   if lang_code in language_codes_set}
        else:
            filtered_language_map = LANGUAGE_MAP

        count = 0
        for lang_id, lang_code in filtered_language_map.items():
            cursor.execute(
                f"SELECT texts FROM question_translation WHERE question_id = {ph} AND language_id = {ph}",
                (question_id, lang_id),
            )
            qrow = cursor.fetchone()
            cursor.execute(
                f"SELECT texts FROM answer_translation WHERE answer_id = {ph} AND language_id = {ph}",
                (answer_id, lang_id),
            )
            arow = cursor.fetchone()
            if not (qrow and arow):
                continue
            q_text = qrow['texts']
            a_text = arow['texts']
            payload = f"Q: {q_text}\nA: {a_text}"
            h = _payload_hash(payload)
            s = _load_lang_hash_ignores(lang_code)
            if h not in s:
                s.add(h)
                _save_lang_hash_ignores(lang_code, s)
                count += 1

        return count

def ignore_current_vectors_for_qa(question_id: int, answer_id: int) -> int:
    """Record hash ignores for current QA payloads across all languages.

    Returns the number of language hashes added.
    """
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        LANGUAGE_MAP = get_language_map()  # {id: 'ja', ...}
        count = 0
        for lang_id, lang_code in LANGUAGE_MAP.items():
            cursor.execute(
                f"SELECT texts FROM question_translation WHERE question_id = {ph} AND language_id = {ph}",
                (question_id, lang_id),
            )
            qrow = cursor.fetchone()
            cursor.execute(
                f"SELECT texts FROM answer_translation WHERE answer_id = {ph} AND language_id = {ph}",
                (answer_id, lang_id),
            )
            arow = cursor.fetchone()
            if not (qrow and arow):
                continue
            q_text = qrow['texts']
            a_text = arow['texts']
            payload = f"Q: {q_text}\nA: {a_text}"
            h = _payload_hash(payload)
            s = _load_lang_hash_ignores(lang_code)
            if h not in s:
                s.add(h)
                _save_lang_hash_ignores(lang_code, s)
                count += 1

        return count

def append_qa_to_vector_index_for_languages(question_id: int, answer_id: int, language_codes: list = None) -> int:
    """Append a single QA pair to vector indexes for specific languages only.

    Args:
        question_id: The question ID
        answer_id: The answer ID  
        language_codes: List of language codes to update (e.g., ['ja', 'en']). If None, updates all languages.

    Returns the count of vectors appended across specified languages.
    """
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        # Resolve QA.id for consistency in meta
        cursor.execute(f"SELECT id FROM QA WHERE question_id = {ph} AND answer_id = {ph}", (question_id, answer_id))
        qa_row = cursor.fetchone()
        qa_id = (qa_row['id']) if qa_row else None

        # Fetch question time for texts sidecar
        cursor.execute(f"SELECT time FROM question WHERE question_id = {ph}", (question_id,))
        trow = cursor.fetchone()
        time_val = (trow['time']) if trow else None

        LANGUAGE_MAP = get_language_map()  # {id: 'ja'/'en'/...}

        # Filter to only specified languages if provided
        if language_codes is not None:
            language_codes_set = set(language_codes)
            filtered_language_map = {lang_id: lang_code for lang_id, lang_code in LANGUAGE_MAP.items() 
                                   if lang_code in language_codes_set}
        else:
            filtered_language_map = LANGUAGE_MAP

        appended = 0
        for lang_id, lang_code in filtered_language_map.items():
            # Fetch translations for this language
            cursor.execute(
                f"SELECT texts FROM question_translation WHERE question_id = {ph} AND language_id = {ph}",
                (question_id, lang_id),
            )
            qrow = cursor.fetchone()
            cursor.execute(
                f"SELECT texts FROM answer_translation WHERE answer_id = {ph} AND language_id = {ph}",
                (answer_id, lang_id),
            )
            arow = cursor.fetchone()
            if not (qrow and arow):
                continue

            question_text = qrow['texts']
            answer_text = arow['texts']
            payload = f"Q: {question_text}\nA: {answer_text}"

            # Compute embedding and normalize
            emb = np.array(get_embedding(payload)).astype("float32").reshape(1, -1)
            faiss.normalize_L2(emb)

            # Load or create index and sidecars
            index = _ensure_index_for_lang(emb.shape[1], lang_code)
            if index is None:
                # Skip this language if existing index has incompatible dim
                continue
            meta_list, texts_list = _load_sidecar_lists(lang_code)

            # Append
            try:
                index.add(emb)
            except Exception:
                # Append failed, skip to keep existing index intact.
                continue

            # Keep the same structure as initial build: (qa_id, question_id)
            meta_list.append((qa_id, question_id))
            texts_list.append((question_text, answer_text, time_val))

            # Persist
            _save_index_and_sidecars(index, meta_list, texts_list, lang_code)
            appended += 1

        return appended

def append_qa_to_vector_index(question_id: int, answer_id: int) -> int:
    """Append a single QA pair (all available languages) to vector indexes.

    Returns the count of vectors appended across languages.
    """
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        # Resolve QA.id for consistency in meta
        cursor.execute(f"SELECT id FROM QA WHERE question_id = {ph} AND answer_id = {ph}", (question_id, answer_id))
        qa_row = cursor.fetchone()
        qa_id = (qa_row['id']) if qa_row else None

        # Fetch question time for texts sidecar
        cursor.execute(f"SELECT time FROM question WHERE question_id = {ph}", (question_id,))
        trow = cursor.fetchone()
        time_val = (trow['time']) if trow else None

        LANGUAGE_MAP = get_language_map()  # {id: 'ja'/'en'/...}

        appended = 0
        for lang_id, lang_code in LANGUAGE_MAP.items():
            # Fetch translations for this language
            cursor.execute(
                f"SELECT texts FROM question_translation WHERE question_id = {ph} AND language_id = {ph}",
                (question_id, lang_id),
            )
            qrow = cursor.fetchone()
            cursor.execute(
                f"SELECT texts FROM answer_translation WHERE answer_id = {ph} AND language_id = {ph}",
                (answer_id, lang_id),
            )
            arow = cursor.fetchone()
            if not (qrow and arow):
                continue

            question_text = qrow['texts']
            answer_text = arow['texts']
            payload = f"Q: {question_text}\nA: {answer_text}"

            # Compute embedding and normalize
            emb = np.array(get_embedding(payload)).astype("float32").reshape(1, -1)
            faiss.normalize_L2(emb)

            # Load or create index and sidecars
            index = _ensure_index_for_lang(emb.shape[1], lang_code)
            if index is None:
                # Skip this language if existing index has incompatible dim
                continue
            meta_list, texts_list = _load_sidecar_lists(lang_code)

            # Append
            try:
                index.add(emb)
            except Exception:
                # Append failed, skip to keep existing index intact.
                continue

            # Keep the same structure as initial build: (qa_id, question_id)
            meta_list.append((qa_id, question_id))
            texts_list.append((question_text, answer_text, time_val))

            # Persist
            _save_index_and_sidecars(index, meta_list, texts_list, lang_code)
            appended += 1

        return appended

# ----------------------------------------------------------------------------
# Index build
# ----------------------------------------------------------------------------

def generate_and_save_vectors():
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        print("ベクトル生成開始...")
        cursor.execute("SELECT id, question_id, answer_id FROM QA")
        qa_rows = cursor.fetchall()
        print(f"総QA数: {len(qa_rows)} 件")

        LANGUAGE_MAP = get_language_map()  # {id:'ja', ...}
        print(f"対応言語: {list(set(LANGUAGE_MAP.values()))}")

        lang_text_map: Dict[str, list] = defaultdict(list)

        for qa_row in tqdm(qa_rows, desc="ベクトル生成中"):
            qa_id = qa_row['id']
            qid = qa_row['question_id']
            aid = qa_row['answer_id']
            
            for lang_id, lang_code in LANGUAGE_MAP.items():
                cursor.execute(
                    f"SELECT texts FROM question_translation WHERE question_id={ph} AND language_id={ph}",
                    (qid, lang_id)
                )
                qrow = cursor.fetchone()

                cursor.execute(
                    f"SELECT texts FROM answer_translation WHERE answer_id={ph} AND language_id={ph}",
                    (aid, lang_id)
                )
                arow = cursor.fetchone()

                cursor.execute(f"SELECT time FROM question WHERE question_id={ph}", (qid,))
                trow = cursor.fetchone()

                if qrow and arow and trow:
                    question_text = qrow['texts']
                    answer_text = arow['texts']
                    time_val = trow['time']
                    text = f"Q: {question_text}\nA: {answer_text}"
                    embedding = get_embedding(text)
                    lang_text_map[lang_code].append(
                        (embedding, (qa_id, qid), (question_text, answer_text, time_val))
                    )

        # 言語ごとにFAISSへ投入して保存
        for lang_code, data in lang_text_map.items():
            if not data:
                print(f"{lang_code} のデータが空なのでスキップ")
                continue

            vectors = np.array([x[0] for x in data]).astype("float32")
            faiss.normalize_L2(vectors)
            meta = [x[1] for x in data]
            texts = [x[2] for x in data]

            index = faiss.IndexFlatIP(vectors.shape[1])
            index.add(vectors)

            faiss.write_index(index, str(VECTOR_DIR / f"vectors_{lang_code}.faiss"))
            with open(VECTOR_DIR / f"vectors_{lang_code}.meta.pkl", "wb") as f:
                pickle.dump(meta, f)
            with open(VECTOR_DIR / f"vectors_{lang_code}.texts.pkl", "wb") as f:
                pickle.dump(texts, f)

            print(f"保存完了: vectors_{lang_code}.*（{len(data)} 件）")

        print("全ベクトル保存完了")

# ----------------------------------------------------------------------------
# Retrieval
# ----------------------------------------------------------------------------

def _generate_conversation_summary(history_qa: List[Tuple[str, str]], lang: str = "ja") -> str:
    """
    会話履歴から検索用の要約文を生成する
    既存のreactive.pyのsummarize_text関数を活用
    """
    if not history_qa or len(history_qa) == 0:
        return ""
    
    # 会話履歴が短すぎる場合は要約しない
    if len(history_qa) < 2:
        return ""
    
    # 会話履歴をテキストに変換（最新3件のみ）
    conversation_text = ""
    for i, (q, a) in enumerate(history_qa[-3:], 1):
        conversation_text += f"Q{i}: {q}\nA{i}: {a}\n"
    
    try:
        # 既存のsummarize_text関数を使用
        from api.utils.reactive import summarize_text
        summary = summarize_text(conversation_text, lang)
        
        # 検索用に短縮（100文字以内）
        if len(summary) > 100:
            summary = summary[:100] + "..."
        
        return summary.strip() if summary else ""
    except Exception as e:
        print(f"会話要約生成エラー: {e}")
        return ""


def rag(question: str, similarity_threshold: float = 0.3, history_qa: List[Tuple[str, str]] = None) -> Dict[int, Dict[str, Any]]:
    """
    言語検出に失敗/未対応の場合は例外を投げる
    成功時は rank-> [answer, question, time, similarity] を返す。
    similarity_threshold以下のスコアの結果は除外される。
    history_qaが提供された場合、会話要約も検索クエリに含める。
    """
    import time
    start_time = time.time()
    
    # 言語検出（Linguaのみ、未対応/検出不可は例外）
    lang = detect_lang(question)  # 'ja' / 'en' / 'vi' / 'zh' / 'ko'
    print(f"[{time.time()-start_time:.2f}s] 検出言語: {lang}")

    # 会話要約を生成（履歴がある場合）
    conversation_summary = ""
    if history_qa and len(history_qa) > 0:
        summary_start = time.time()
        conversation_summary = _generate_conversation_summary(history_qa, lang)
        print(f"[{time.time()-start_time:.2f}s] 会話要約完了 (所要時間: {time.time()-summary_start:.2f}s): {conversation_summary}")

    base_path = VECTOR_DIR / f"vectors_{lang}"
    faiss_path = base_path.with_suffix(".faiss")
    meta_path = base_path.with_suffix(".meta.pkl")
    texts_path = base_path.with_suffix(".texts.pkl")

    if not faiss_path.exists():
        print(f"{faiss_path} が存在しません → 生成を試みます")
        generate_and_save_vectors()

    if not faiss_path.exists():
        # インデックス未生成などの運用エラーは 500 に寄せたいのでここでは例外を投げず上位で処理
        raise RuntimeError(f"ベクトルが見つかりません: {faiss_path}")

    index = faiss.read_index(str(faiss_path))
    with open(meta_path, "rb") as f:
        meta = pickle.load(f)
    with open(texts_path, "rb") as f:
        texts = pickle.load(f)

    # Load ignore lists
    ignored_qa_ids = _load_global_qa_ignore()
    ignored_hashes = _load_lang_hash_ignores(lang)

    # 検索クエリを構築（要約がある場合は組み合わせ）
    search_query = question
    if conversation_summary:
        search_query = f"{question} {conversation_summary}"
        print(f"[{time.time()-start_time:.2f}s] 拡張検索クエリ: {search_query}")

    embed_start = time.time()
    query_vec = np.array(get_embedding(search_query)).astype("float32").reshape(1, -1)
    print(f"[{time.time()-start_time:.2f}s] Embedding生成完了 (所要時間: {time.time()-embed_start:.2f}s)")
    
    faiss.normalize_L2(query_vec)
    search_start = time.time()
    D, I = index.search(query_vec, 10)  # より多く取得して閾値でフィルタリング
    print(f"[{time.time()-start_time:.2f}s] ベクトル検索完了 (所要時間: {time.time()-search_start:.3f}s)")

    results: Dict[int, Dict[str, Any]] = {}
    ranked = sorted(zip(I[0], D[0]), key=lambda x: x[1], reverse=True)

    rank = 1
    # DB 接続（category 取得用）
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        for idx, similarity in ranked:
            # 類似度が閾値以上の場合のみ結果に含める
            if similarity >= similarity_threshold:
                question_text, answer_text, time_val = texts[idx]
                qa_meta = meta[idx] if idx < len(meta) else (None, None)
                qa_id = None
                qid = None
                try:
                    qa_id = int(qa_meta[0]) if qa_meta and qa_meta[0] is not None else None
                    qid = int(qa_meta[1]) if qa_meta and qa_meta[1] is not None else None
                except Exception:
                    qa_id = None
                    qid = None

                # Check ignores
                payload_hash = _payload_hash(f"Q: {question_text}\nA: {answer_text}")
                if (qa_id is not None and qa_id in ignored_qa_ids) or (payload_hash in ignored_hashes):
                    continue

                # category_id 取得（存在しない場合は None）
                cat_id = None
                if qid is not None:
                    try:
                        cursor.execute(f"SELECT category_id FROM question WHERE question_id = {ph}", (qid,))
                        row = cursor.fetchone()
                        if row:
                            cat_id = int(row['category_id'])
                    except Exception:
                        cat_id = None

                # 回答の最終編集時刻（answer.time）を取得
                ans_time = None
                if qa_id is not None:
                    try:
                        cursor.execute(f"SELECT answer_id FROM QA WHERE id = {ph}", (qa_id,))
                        qa_row = cursor.fetchone()
                        if qa_row:
                            ans_id_val = qa_row['answer_id']
                            if ans_id_val is not None:
                                ans_id = int(ans_id_val)
                                cursor.execute(f"SELECT time FROM answer WHERE answer_id = {ph}", (ans_id,))
                                arow = cursor.fetchone()
                                if arow:
                                    ans_time = arow['time']
                    except Exception:
                        ans_time = None

                results[rank] = {
                    "answer": answer_text,
                    "question": question_text,
                    "time": time_val.isoformat() if time_val else None,
                    "similarity": float(similarity),
                    "question_id": qid,
                    "category_id": cat_id,
                    "answer_time": ans_time.isoformat() if ans_time else None,
                }
                rank += 1

                # 最大5件まで
                if rank > 5:
                    break

    print(f"[{time.time()-start_time:.2f}s] RAG検索完了: 類似度閾値 {similarity_threshold} 以上の結果 {len(results)}件")
    return results

# ----------------------------------------------------------------------------
# Prompt builders
# ----------------------------------------------------------------------------

def _build_prompt_ja(question_text: str, rag_qa: list, history_qa: list) -> str:
    # rag_qa の各要素は {sid:"S#", question, answer} を想定
    prompt = (
        "あなたは『滋賀県国際協会』に関する情報のみを根拠に、事実ベースで簡潔に回答するアシスタントです。\n"
        "回答の各文を必ず出典IDで根拠づけてください。出力は指示したJSONのみ。思考過程は出力しないでください。\n\n"
    )
    prompt += "【コンテキスト（出典候補）】\n"
    for qa in rag_qa:
        prompt += f"{qa['sid']}: {{question: \"{qa['question']}\", answer: \"{qa['answer']}\"}}\n"
    prompt += "\n【これまでの会話履歴】\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"User{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n【現在の質問】\n{question_text}\n\n"
    prompt += (
        "要件:\n"
        "- 回答は与えたコンテキストを参考に作成してください。与えたコンテキストからURLが提示可能な場合は示してください。\n"
        "- 回答本文に [S#] や 'S1' などの出典IDは記載しないこと。出典は used_source_ids / evidence のみで示してください。\n"
        "- 各文に少なくとも1つの出典ID [S#] を付与。\n"
        "- 実際に使った出典だけを used_source_ids に列挙（未使用は含めない）。\n"
        "- 可能なら根拠箇所を evidence.quotes に原文抜粋として含める（任意）。\n"
        "- ・根拠は与えられた資料（RAGコンテキスト）と会話の要約のみ。そこにない事実は『原典で確認できませんでした』と述べる。\n"
        "- 読みやすさのため、改行や段落（空行）・箇条書き（- や 1.）で整理する。\n"
        "- 出力は次のJSONに厳密準拠し、これ以外は何も出力しない:\n"
        "{\n  \"answer\": \"文末ごとに [S1] のように出典IDを付与\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"原文抜粋\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_en(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "You are an assistant that answers factually and concisely based solely on information about 'Shiga International Association'."
        " You must provide source IDs to support each sentence in your answer. Output only the specified JSON. Do not reveal your thought process.\n\n"
    )
    prompt += "[Context (source candidates)]\n"
    for qa in rag_qa:
        prompt += f"{qa['sid']}: {{question: \"{qa['question']}\", answer: \"{qa['answer']}\"}}\n"
    prompt += "\n[Conversation History]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"User{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n[Current Question]\n{question_text}\n\n"
    prompt += (
        "Requirements:\n"
        "- Create your answer based on the given context and the conversation summary.\n"
        "- Do not include [S#] or source IDs in the answer text; list sources only in used_source_ids/evidence.\n"
        "- Add at least one source ID [S#] to each sentence.\n"
        "- List only actually used sources in used_source_ids (exclude unused ones).\n"
        "- Optionally include exact quotes in evidence.quotes.\n"
        "- Sources are limited to the given RAG context and conversation history. "
        "If the fact is not present, state 'Not found in the original source.'.\n"
        "- For readability, use line breaks, paragraphs (blank lines), and bullet points (-, 1.) to organize content.\n"
        "- Output strictly according to the following JSON format and nothing else:\n"
        "{\n  \"answer\": \"Each sentence with [S1] style source ID citations\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"exact quote\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_vi(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "Bạn là trợ lý trả lời dựa trên thực tế và ngắn gọn chỉ dựa trên thông tin về 'Hiệp hội Quốc tế Shiga'."
        " Bạn phải cung cấp mã nguồn để hỗ trợ mỗi câu trong câu trả lời. Chỉ xuất JSON được chỉ định. Không tiết lộ quá trình suy nghĩ.\n\n"
    )
    prompt += "[Ngữ cảnh (nguồn tham khảo)]\n"
    for qa in rag_qa:
        prompt += f"{qa['sid']}: {{question: \"{qa['question']}\", answer: \"{qa['answer']}\"}}\n"
    prompt += "\n[Lịch sử hội thoại]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"Người dùng{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n[Câu hỏi hiện tại]\n{question_text}\n\n"
    prompt += (
        "Yêu cầu:\n"
        "- Tạo câu trả lời dựa trên ngữ cảnh đã cho và tóm tắt hội thoại.\n"
        "- Không chèn [S#] hoặc mã nguồn vào phần trả lời; chỉ liệt kê trong used_source_ids/evidence.\n"
        "- Thêm ít nhất một mã nguồn [S#] vào mỗi câu.\n"
        "- Chỉ liệt kê các nguồn thực sự đã sử dụng trong used_source_ids (loại trừ những nguồn chưa sử dụng).\n"
        "- Tùy chọn: bao gồm trích dẫn chính xác trong evidence.quotes.\n"
        "- Nguồn chỉ giới hạn ở ngữ cảnh RAG và hội thoại. Nếu thông tin không có, hãy nêu rõ 'Không tìm thấy trong nguyên bản.'.\n"
        "- Để dễ đọc, hãy dùng đoạn xuống dòng và gạch đầu dòng (-, 1.) khi phù hợp.\n"
        "- Xuất chính xác theo định dạng JSON sau và không gì khác:\n"
        "{\n  \"answer\": \"Mỗi câu với trích dẫn mã nguồn kiểu [S1]\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"trích dẫn chính xác\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_zh(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "你是基于事实简洁回答的助手，仅依据关于'滋贺县国际协会'的信息。"
        " 你必须为回答中的每句话提供来源ID作为依据。只输出指定的JSON，不要输出思考过程。\n\n"
    )
    prompt += "【上下文（候选来源）】\n"
    for qa in rag_qa:
        prompt += f"{qa['sid']}: {{question: \"{qa['question']}\", answer: \"{qa['answer']}\"}}\n"
    prompt += "\n【对话历史】\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"用户{i}: {q}\n机器人{i}: {a}\n"
    prompt += f"\n【当前问题】\n{question_text}\n\n"
    prompt += (
        "要求：\n"
        "- 基于给定的上下文和对话摘要创建回答。\n"
        "- 回答正文不要包含 [S#] 或来源ID；仅在 used_source_ids/evidence 中列出。\n"
        "- 为每句话添加至少一个来源ID [S#]。\n"
        "- 在used_source_ids中仅列出实际使用的来源（排除未使用的）。\n"
        "- 可选：在evidence.quotes中包含原文引文。\n"
        "- 证据仅限于提供的RAG上下文和对话。如果资料中不存在，请说明 '原典中未找到'.\n"
        "- 为提高可读性，请使用换行、段落（空行）和项目符号（-、1.）。\n"
        "- 严格按照以下JSON格式输出，不要输出其他内容：\n"
        "{\n  \"answer\": \"每句话带有[S1]样式的来源ID引用\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"原文引文\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_ko(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "당신은 '시가현 국제협회'에 관한 정보만을 근거로 사실에 기반하여 간결하게 답변하는 어시스턴트입니다."
        " 답변의 각 문장을 반드시 출처ID로 근거를 제시해야 합니다. 출력은 지정된 JSON만 허용됩니다. 사고 과정은 출력하지 마세요.\n\n"
    )
    prompt += "[컨텍스트(출처 후보)]\n"
    for qa in rag_qa:
        prompt += f"{qa['sid']}: {{question: \"{qa['question']}\", answer: \"{qa['answer']}\"}}\n"
    prompt += "\n[대화 기록]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"사용자{i}: {q}\n봇{i}: {a}\n"
    prompt += f"\n[현재 질문]\n{question_text}\n\n"
    prompt += (
        "요건:\n"
        "- 주어진 컨텍스트와 대화 요약을 참고하여 답변을 작성하세요.\n"
        "- 답변 본문에 [S#] 또는 출처ID를 넣지 마세요; used_source_ids/evidence 에만 나열하세요.\n"
        "- 각 문장에 최소 1개의 출처ID [S#]를 부여하세요.\n"
        "- 실제로 사용한 출처만 used_source_ids에 열거하세요 (미사용은 포함하지 않음).\n"
        "- 가능하면 근거 부분을 evidence.quotes에 원문 발췌로 포함하세요 (선택사항).\n"
        "- 근거는 제공된 RAG 컨텍스트와 대화 내용에 한정됩니다. 존재하지 않는 경우 '원전에 확인되지 않았습니다'라고 진술하세요.\n"
        "- 가독성을 위해 줄바꿈이나 단락(빈 줄), 글머리표(-, 1.)로 정리하세요.\n"
        "- 출력은 다음 JSON에 엄격히 준수하고, 이 외에는 아무것도 출력하지 마세요:\n"
        "{\n  \"answer\": \"문장 끝마다 [S1]과 같이 출처ID를 부여\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"원문 발췌\"]} ]\n}\n"
    )
    return prompt

def _build_prompt_pt(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "Você é um assistente que responde de forma factual e concisa com base apenas nas informações sobre a 'Associação Internacional de Shiga'. "
        "Forneça IDs de fonte para sustentar cada frase da resposta. Saída somente no JSON especificado. Não revele seu processo de pensamento.\n\n"
    )
    prompt += "[Contexto (candidatos a fontes)]\n"
    for qa in rag_qa:
        prompt += f"{qa['sid']}: {{question: \"{qa['question']}\", answer: \"{qa['answer']}\"}}\n"
    prompt += "\n[Histórico da Conversa]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"Usuário{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n[Pergunta Atual]\n{question_text}\n\n"
    prompt += (
        "Requisitos:\n"
        "- Elabore a resposta com base no contexto fornecido e no resumo da conversa.\n"
        "- Não inclua [S#] ou IDs de fonte no texto da resposta; liste somente em used_source_ids/evidence.\n"
        "- Adicione pelo menos um ID de fonte [S#] a cada frase.\n"
        "- Liste apenas as fontes realmente utilizadas em used_source_ids (exclua as não utilizadas).\n"
        "- Opcional: inclua citações exatas em evidence.quotes.\n"
        "- As fontes limitam-se ao contexto RAG fornecido e ao histórico/resumo da conversa. "
        "Se o fato não estiver presente, declare: 'Não foi encontrado na fonte original.'.\n"
        "- Para legibilidade, use quebras de linha, parágrafos (linhas em branco) e marcadores (-, 1.).\n"
        "- Saída estritamente no seguinte formato JSON e nada mais:\n"
        "{\n  \"answer\": \"Cada frase com citações de ID de fonte no estilo [S1]\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"citação exata\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_es(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "Eres un asistente que responde de forma fáctica y concisa basándose únicamente en información sobre la 'Asociación Internacional de Shiga'. "
        "Debes proporcionar IDs de fuente para sustentar cada frase de tu respuesta. Salida solo en el JSON especificado. No reveles tu proceso de pensamiento.\n\n"
    )
    prompt += "[Contexto (fuentes candidatas)]\n"
    for qa in rag_qa:
        prompt += f"{qa['sid']}: {{question: \"{qa['question']}\", answer: \"{qa['answer']}\"}}\n"
    prompt += "\n[Historial de Conversación]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"Usuario{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n[Pregunta Actual]\n{question_text}\n\n"
    prompt += (
        "Requisitos:\n"
        "- Crea tu respuesta basándote en el contexto proporcionado y en el resumen del diálogo.\n"
        "- No incluyas [S#] ni IDs de fuente en el texto de la respuesta; enuméralos solo en used_source_ids/evidence.\n"
        "- Añade al menos un ID de fuente [S#] a cada frase.\n"
        "- Enumera solo las fuentes realmente usadas en used_source_ids (excluye las no usadas).\n"
        "- Opcionalmente incluye citas textuales en evidence.quotes.\n"
        "- Las fuentes se limitan al contexto RAG dado y al historial/resumen de la conversación. "
        "Si el hecho no está presente, indica: 'No se encontró en la fuente original.'.\n"
        "- Para mejorar la lectura, usa saltos de línea, párrafos (líneas en blanco) y viñetas (-, 1.).\n"
        "- Salida estrictamente según el siguiente JSON y nada más:\n"
        "{\n  \"answer\": \"Cada frase con citas de ID de fuente estilo [S1]\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"cita textual\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_tl(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "Ikaw ay isang assistant na sumasagot nang makatotohanan at maikli batay lamang sa impormasyon tungkol sa 'Shiga International Association'. "
        "Dapat kang magbigay ng source ID para suportahan ang bawat pangungusap. JSON lang ang ilalabas. Huwag ilahad ang iyong thought process.\n\n"
    )
    prompt += "[Konteksto (mga posibleng pinagmulan)]\n"
    for qa in rag_qa:
        prompt += f"{qa['sid']}: {{question: \"{qa['question']}\", answer: \"{qa['answer']}\"}}\n"
    prompt += "\n[Talaan ng Usapan]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"Gumagamit{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n[Kasalukuyang Tanong]\n{question_text}\n\n"
    prompt += (
        "Mga Kinakailangan:\n"
        "- Gawin ang sagot batay sa ibinigay na konteksto at buod ng usapan.\n"
        "- Huwag ilagay ang [S#] o source ID sa mismong sagot; ilista lamang sa used_source_ids/evidence.\n"
        "- Maglagay ng kahit isang source ID [S#] sa bawat pangungusap.\n"
        "- Ilahad lamang ang aktuwal na nagamit na sources sa used_source_ids (huwag isama ang hindi nagamit).\n"
        "- Opsyonal: isama ang eksaktong sipi sa evidence.quotes.\n"
        "- Limitado ang ebidensiya sa ibinigay na RAG context at kasaysayan/buod ng usapan. "
        "Kung wala ang katotohanan sa mga iyon, ilahad: 'Hindi natagpuan sa orihinal na sanggunian.'.\n"
        "- Para sa pagiging mabasa, gumamit ng mga line break, talata (blankong linya), at bullet points (-, 1.).\n"
        "- Ilabas nang eksakto ayon sa sumusunod na JSON at wala nang iba pa:\n"
        "{\n  \"answer\": \"Bawat pangungusap ay may citation na [S1]\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"eksaktong sipi\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_id(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "Anda adalah asisten yang menjawab secara faktual dan ringkas hanya berdasarkan informasi tentang 'Asosiasi Internasional Shiga'. "
        "Anda harus mencantumkan ID sumber untuk mendukung setiap kalimat. Keluarkan hanya JSON yang ditentukan. Jangan ungkapkan proses berpikir Anda.\n\n"
    )
    prompt += "[Konteks (kandidat sumber)]\n"
    for qa in rag_qa:
        prompt += f"{qa['sid']}: {{question: \"{qa['question']}\", answer: \"{qa['answer']}\"}}\n"
    prompt += "\n[Riwayat Percakapan]\n"
    for i, (q, a) in enumerate(history_qa, 1):
        prompt += f"Pengguna{i}: {q}\nBot{i}: {a}\n"
    prompt += f"\n[Pertanyaan Saat Ini]\n{question_text}\n\n"
    prompt += (
        "Persyaratan:\n"
        "- Buat jawaban berdasarkan konteks yang diberikan dan ringkasan percakapan.\n"
        "- Jangan cantumkan [S#] atau ID sumber di teks jawaban; cantumkan hanya di used_source_ids/evidence.\n"
        "- Tambahkan setidaknya satu ID sumber [S#] pada setiap kalimat.\n"
        "- Cantumkan hanya sumber yang benar-benar digunakan di used_source_ids (kecualikan yang tidak digunakan).\n"
        "- Opsional: sertakan kutipan persis di evidence.quotes.\n"
        "- Sumber dibatasi pada konteks RAG yang diberikan dan riwayat/ringkasan percakapan. "
        "Jika fakta tidak ada di sana, nyatakan: 'Tidak ditemukan dalam sumber asli.'.\n"
        "- Demi keterbacaan, gunakan pemisah baris, paragraf (baris kosong), dan bullet (-, 1.).\n"
        "- Keluaran harus mengikuti format JSON berikut secara ketat dan tidak ada yang lain:\n"
        "{\n  \"answer\": \"Setiap kalimat dengan sitasi ID sumber gaya [S1]\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"kutipan persis\"]} ]\n}\n"
    )
    return prompt

# 検出言語ごとのビルダーマップ
_PROMPT_BUILDERS = {
    "ja": _build_prompt_ja,
    "en": _build_prompt_en,
    "vi": _build_prompt_vi,
    "zh": _build_prompt_zh,
    "ko": _build_prompt_ko,
    "pt": _build_prompt_pt,
    "es": _build_prompt_es,
    "tl": _build_prompt_tl,
    "id": _build_prompt_id,
}

# ----------------------------------------------------------------------------
# LLM helpers
# ----------------------------------------------------------------------------

def _responses_text(
    prompt: str,
    *,
    model: str = "gpt-4.1-nano",
    max_output_tokens: int = 600,   # 互換性のため受け取るが未使用
    timeout_s: int = 60,
    response_schema: Optional[dict] = None,  # 互換性のため受け取るが未使用
    reasoning_effort: str = "low",
    include_reasoning: bool = False,         # 互換性のため受け取るが未使用
) -> Tuple[str, str]:
    """最小でシンプルな実装。

    1) Chat Completions を使用（もっとも互換性が高い）
    2) ダメなら Responses API を最小引数でフォールバック
    
    Returns:
        Tuple[str, str]: (生成されたテキスト, 使用されたモデル名)
    """
    client_req = client.with_options(timeout=timeout_s)

    # GPT-4.1-nano
    if model == "gpt-4.1-nano":
        try:
            chat = client_req.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
            )
            result = (chat.choices[0].message.content or "").strip()
            print(f"✓ LLM回答生成成功: model=gpt-4.1-nano")
            return result, "gpt-4.1-nano"
        except Exception as e:
            print(f"✗ gpt-4.1-nano failed: {e}")
                
    # GPT-5-nano
    if model == "gpt-5-nano":
        try:
            chat = client_req.chat.completions.create(
                model="gpt-5-nano",
                messages=[{"role": "user", "content": prompt}],
                reasoning_effort=reasoning_effort,
            )
            result = (chat.choices[0].message.content or "").strip()
            print(f"✓ LLM回答生成成功: model=gpt-5-nano, reasoning_effort={reasoning_effort}")
            return result, "gpt-5-nano"
        except Exception as e:
            print(f"✗ gpt-5-nano failed: {e}")

    # GPT-5-mini
    if model == "gpt-5-mini":
        try:
            chat = client_req.chat.completions.create(
                model="gpt-5-mini",
                messages=[{"role": "user", "content": prompt}],
                reasoning_effort=reasoning_effort,
            )
            result = (chat.choices[0].message.content or "").strip()
            print(f"✓ LLM回答生成成功: model=gpt-5-mini, reasoning_effort={reasoning_effort}")
            return result, "gpt-5-mini"
        except Exception as e:
            print(f"✗ gpt-5-mini failed: {e}")

    # 2) Responses API（最小）
    try:
        resp = client_req.responses.create(model=model, input=prompt)
        result = (getattr(resp, "output_text", "") or "").strip()
        print(f"✓ LLM回答生成成功: model={model} (Responses API fallback)")
        return result, f"{model} (Responses API)"
    except Exception as e_resp:
        print(f"✗ API error: all methods failed. Last error: {e_resp}")
        return "", "none"



def _clip_history(history_qa: List[Tuple[str, str]], k: int) -> List[Tuple[str, str]]:
    return history_qa[-k:] if k > 0 else []

# ----------------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------------

def generate_answer_with_llm(
    question_text: str,
    rag_qa: List[Dict[str, Any]],
    history_qa: List[Tuple[str, str]],
    *,
    lang: Optional[str] = None,
    model: str = "gpt-4.1-nano",
    reasoning_effort: str = "low",
    max_history_in_prompt: int = 6,
) -> Dict[str, Any]:
    """RAGで集めた参照と会話履歴から、出典付きJSONを返す。"""
    if not lang:
        try:
            lang = detect_lang(question_text)
        except Exception:
            lang = "ja"  # フォールバック

    # rag_qa へ sid を付与（S1..Sn）
    rag_with_sid: List[Dict[str, Any]] = []
    for i, qa in enumerate(rag_qa, 1):
        qa_copy = dict(qa)
        qa_copy["sid"] = f"S{i}"
        rag_with_sid.append(qa_copy)

    builder = _PROMPT_BUILDERS.get(lang, _PROMPT_BUILDERS["ja"])
    clipped_hist = _clip_history(history_qa, max_history_in_prompt)

    prompt = builder(question_text, rag_with_sid, clipped_hist)
    
    import time
    llm_start = time.time()
    # 期待するJSONのスキーマを指定して厳密出力を促す
    response_schema = {
        "type": "object",
        "properties": {
            "answer": {"type": "string"},
            "used_source_ids": {
                "type": "array",
                "items": {"type": "string"}
            },
            "evidence": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "source_id": {"type": "string"},
                        "quotes": {
                            "type": "array",
                            "items": {"type": "string"}
                        }
                    },
                    "required": ["source_id", "quotes"],
                    "additionalProperties": False
                }
            }
        },
        "required": ["answer", "used_source_ids", "evidence"],
        "additionalProperties": False
    }
    content, used_model = _responses_text(
        prompt,
        model=model,
        max_output_tokens=800,
        timeout_s=90,
        response_schema=response_schema,
        reasoning_effort=reasoning_effort,
    )
    print(f"LLM回答生成完了 (所要時間: {time.time()-llm_start:.2f}s, 使用モデル: {used_model})")

    try:
        data = json.loads(content)
        answer_text = str(data.get("answer", "")).strip()
        used_ids = [str(x) for x in (data.get("used_source_ids") or [])]
        evidence = data.get("evidence") or []
        return {
            "answer": answer_text, 
            "used_source_ids": used_ids, 
            "evidence": evidence,
            "model_used": used_model,
        }
    except Exception:
        # フォールバック: そのままテキストを返し、全ての出典を使用扱い
        return {
            "answer": content, 
            "used_source_ids": [x["sid"] for x in rag_with_sid], 
            "evidence": [],
            "model_used": used_model,
        }


def answer_with_rag(
    question_text: str,
    history_qa: List[Tuple[str, str]],
    *,
    similarity_threshold: float = 0.3,
    max_history_in_prompt: int = 6,
    model: str = "gpt-4.1-nano",
    reasoning_effort: str = "low",
) -> Dict[str, Any]:
    """Retrieve → generate. 統一フォーマットで返す。"""
    lang = "ja"
    try:
        lang = detect_lang(question_text)
    except Exception:
        pass

    # 検索（会話履歴も含める）
    results = rag(question_text, similarity_threshold=similarity_threshold, history_qa=history_qa)

    # 整形（UIで使いやすいよう辞書リスト化）。sid を振る
    references = []
    for i, (rank, item) in enumerate(results.items(), 1):
        if isinstance(item, dict):
            references.append({
                "sid": f"S{i}",
                "rank": rank,
                "question": item.get("question"),
                "answer": item.get("answer"),
                "time": item.get("time"),
                "similarity": item.get("similarity"),
                "question_id": item.get("question_id"),
                "category_id": item.get("category_id"),
                "answer_time": item.get("answer_time"),
            })
        else:
            ans, que, t, sim = item
            references.append({
                "sid": f"S{i}",
                "rank": rank,
                "question": que,
                "answer": ans,
                "time": t,
                "similarity": sim,
            })

    # 参照ゼロ → フォールバック応答（推測は避ける指示）
    if not references:
        # 言語に応じてフォールバック文面を切り替える
        fallback_texts = {
            "ja": (
                "参照情報を見つけられませんでした。推測は避け、情報不足を明示しつつ、\n"
                "わかっている範囲で簡潔に回答してください。\n"
                "読みやすさのため、段落や箇条書き（- や 1.）を適宜用いてください。\n\n"
                f"【質問】\n{question_text}\n"
            ),
            "en": (
                "No reference information was found. Avoid guessing and clearly state the information gap.\n"
                "Answer concisely only within what is known.\n"
                "For readability, use paragraphs and bullet points (-, 1.) where helpful.\n\n"
                f"Question:\n{question_text}\n"
            ),
            "vi": (
                "Không tìm thấy thông tin tham chiếu. Tránh suy đoán và nêu rõ những phần còn thiếu thông tin.\n"
                "Vui lòng trả lời ngắn gọn trong phạm vi điều đã biết.\n"
                "Để dễ đọc, hãy dùng đoạn xuống dòng và gạch đầu dòng (-, 1.) khi phù hợp.\n\n"
                f"Câu hỏi:\n{question_text}\n"
            ),
            "zh": (
                "未找到可参考的信息。请避免猜测，明确说明信息不足之处。\n"
                "请在已知范围内简洁作答。\n"
                "为提高可读性，请使用段落/换行与项目符号（-、1.）。\n\n"
                f"问题：\n{question_text}\n"
            ),
            "ko": (
                "참고할 정보를 찾지 못했습니다. 추측은 피하고 정보 부족을 명확히 밝혀주세요.\n"
                "아는 범위 내에서 간결하게 답변해주세요.\n"
                "가독성을 위해 단락/줄바꿈과 글머리표(-, 1.)를 적절히 사용하세요.\n\n"
                f"질문:\n{question_text}\n"
            ),
        }
        fallback_prompt = fallback_texts.get(lang, fallback_texts["ja"])  # 安全フォールバック
        text, used_model = _responses_text(fallback_prompt, model=model, max_output_tokens=400, timeout_s=60, reasoning_effort=reasoning_effort)
        print(f"フォールバック回答生成: 使用モデル={used_model}")
        return {
            "type": "rag",
            "text": text.strip(),
            "meta": {
                "lang": lang,
                "references": [],
                "similarity_threshold": similarity_threshold,
                "model_used": used_model,
            },
        }

    gen = generate_answer_with_llm(
        question_text,
        references,
        history_qa,
        lang=lang,
        model=model,
        reasoning_effort=reasoning_effort,
        max_history_in_prompt=max_history_in_prompt,
    )

    answer_text = gen.get("answer", "").strip()
    used_ids = set(gen.get("used_source_ids", []))
    evidence = gen.get("evidence", [])
    model_used = gen.get("model_used", "unknown")
    used_references = [r for r in references if r.get("sid") in used_ids] if used_ids else references

    # Strip inline citation tags like [S1], [S2] from the displayed answer
    # Preserve line breaks and normalize spaces without collapsing paragraphs
    text_no_cite = re.sub(r"\s*\[S\d+\]", "", answer_text)
    t = text_no_cite.replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"[ \t]{2,}", " ", t)             # collapse multiple spaces/tabs only
    t = "\n".join(line.rstrip() for line in t.split("\n"))  # trim end-of-line spaces
    clean_text = re.sub(r"\n{3,}", "\n\n", t).strip()     # keep at most one blank line between paragraphs

    return {
        "type": "rag",
        "text": clean_text,
        "meta": {
            "lang": lang,
            "references": used_references,
            "used_source_ids": list(used_ids) if used_ids else [r.get("sid") for r in references],
            "evidence": evidence,
            "similarity_threshold": similarity_threshold,
            "model_used": model_used,
        },
    }

# ----------------------------------------------------------------------------
# Orchestrator (sequential flow)
# ----------------------------------------------------------------------------

try:
    # 循環依存を避けるため遅延インポート
    # 正しいパッケージパスでのインポートを優先
    from api.utils.reactive import reactive_handle, ReactiveConfig
except Exception:
    try:
        # 互換: 実行パスによっては直下解決できる場合がある
        from reactive import reactive_handle, ReactiveConfig  # fallback
    except Exception:
        reactive_handle = None
        ReactiveConfig = None


def orchestrate(
    question_text: str,
    history_qa: List[Tuple[str, str]],
    *,
    similarity_threshold: float = 0.3,
    max_history_in_prompt: int = 6,
    model: str = "gpt-4.1-nano",
    reasoning_effort: str = "low",
    reactive_default_lang: str = "ja",
) -> Dict[str, Any]:
    """Front agent → (必要時) RAG の逐次フロー。

    戻り値の型は統一：
      - {"type": "translate"|"summarize"|"rewrite", "text": str, "meta": {...}}
      - {"type": "rag", "text": str, "meta": {"references": [...]}}
      - {"type": "error", "text": str, "meta": {...}}
    """
    # 1) 汎用（翻訳/要約/リライト）なら即応答
    if reactive_handle is not None:
        rcfg = ReactiveConfig(default_lang=reactive_default_lang) if ReactiveConfig else None
        reactive_res = reactive_handle(question_text, history_qa, cfg=rcfg) if rcfg else reactive_handle(question_text, history_qa)
        if reactive_res and reactive_res.get("type") != "route_to_rag":
            return reactive_res

    # 2) それ以外は RAG
    try:
        return answer_with_rag(
            question_text,
            history_qa,
            similarity_threshold=similarity_threshold,
            max_history_in_prompt=max_history_in_prompt,
            model=model,
            reasoning_effort=reasoning_effort,
        )
    except UnsupportedLanguageError:
        return {
            "type": "error",
            "text": "対応外の言語と判定されました。日本語/英語/ベトナム語/中国語/韓国語で入力してください。",
            "meta": {"reason": "unsupported_language"},
        }
    except Exception as e:
        return {
            "type": "error",
            "text": "内部エラーが発生しました。時間をおいて再試行してください。",
            "meta": {"reason": repr(e)},
        }

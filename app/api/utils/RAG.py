import os
import sqlite3
import pickle
import json
import hashlib
from pathlib import Path
from collections import defaultdict
from typing import Optional, Iterable, Union, List, Dict, Tuple, Any
import re
import dotenv
import numpy as np
import faiss
from tqdm import tqdm
from config import DATABASE
from openai import OpenAI
from langchain_community.chat_models import ChatOpenAI
from langchain.schema import HumanMessage
from lingua import Language, LanguageDetectorBuilder

# ----------------------------------------------------------------------------
# Errors
# ----------------------------------------------------------------------------

class LanguageDetectionError(ValueError):
    """言語を特定できなかった（短文/ノイズなど）"""


class UnsupportedLanguageError(ValueError):
    """対応外の言語が検出された（許可: JA/EN/VI/ZH/KO）"""

# ----------------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------------

dotenv.load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

VECTOR_DIR = Path("./api/utils/vectors")
VECTOR_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_ISO = {"ja", "en", "vi", "zh", "ko"}

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
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()
    cur.execute("SELECT id, code FROM language")
    rows = cur.fetchall()
    conn.close()
    return {row[0]: row[1].lower() for row in rows}

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

def ignore_current_vectors_for_qa(question_id: int, answer_id: int) -> int:
    """Record hash ignores for current QA payloads across all languages.

    Returns the number of language hashes added.
    """
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()

    LANGUAGE_MAP = get_language_map()  # {id: 'ja', ...}
    count = 0
    for lang_id, lang_code in LANGUAGE_MAP.items():
        cur.execute(
            "SELECT texts FROM question_translation WHERE question_id = ? AND language_id = ?",
            (question_id, lang_id),
        )
        qrow = cur.fetchone()
        cur.execute(
            "SELECT texts FROM answer_translation WHERE answer_id = ? AND language_id = ?",
            (answer_id, lang_id),
        )
        arow = cur.fetchone()
        if not (qrow and arow):
            continue
        payload = f"Q: {qrow[0]}\nA: {arow[0]}"
        h = _payload_hash(payload)
        s = _load_lang_hash_ignores(lang_code)
        if h not in s:
            s.add(h)
            _save_lang_hash_ignores(lang_code, s)
            count += 1

    conn.close()
    return count

def append_qa_to_vector_index(question_id: int, answer_id: int) -> int:
    """Append a single QA pair (all available languages) to vector indexes.

    Returns the count of vectors appended across languages.
    """
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()

    # Resolve QA.id for consistency in meta
    cur.execute("SELECT id FROM QA WHERE question_id = ? AND answer_id = ?", (question_id, answer_id))
    qa_row = cur.fetchone()
    qa_id = qa_row[0] if qa_row else None

    # Fetch question time for texts sidecar
    cur.execute("SELECT time FROM question WHERE question_id = ?", (question_id,))
    trow = cur.fetchone()
    time_val = trow[0] if trow else None

    LANGUAGE_MAP = get_language_map()  # {id: 'ja'/'en'/...}

    appended = 0
    for lang_id, lang_code in LANGUAGE_MAP.items():
        # Fetch translations for this language
        cur.execute(
            "SELECT texts FROM question_translation WHERE question_id = ? AND language_id = ?",
            (question_id, lang_id),
        )
        qrow = cur.fetchone()
        cur.execute(
            "SELECT texts FROM answer_translation WHERE answer_id = ? AND language_id = ?",
            (answer_id, lang_id),
        )
        arow = cur.fetchone()
        if not (qrow and arow):
            continue

        question_text = qrow[0]
        answer_text = arow[0]
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

    conn.close()
    return appended

# ----------------------------------------------------------------------------
# Index build
# ----------------------------------------------------------------------------

def generate_and_save_vectors():
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()

    print("ベクトル生成開始...")
    cur.execute("SELECT id, question_id, answer_id FROM QA")
    qa_rows = cur.fetchall()
    print(f"総QA数: {len(qa_rows)} 件")

    LANGUAGE_MAP = get_language_map()  # {id:'ja', ...}
    print(f"対応言語: {list(set(LANGUAGE_MAP.values()))}")

    lang_text_map: Dict[str, list] = defaultdict(list)

    for qa_id, qid, aid in tqdm(qa_rows, desc="ベクトル生成中"):
        for lang_id, lang_code in LANGUAGE_MAP.items():
            cur.execute(
                "SELECT texts FROM question_translation WHERE question_id=? AND language_id=?",
                (qid, lang_id)
            )
            qrow = cur.fetchone()

            cur.execute(
                "SELECT texts FROM answer_translation WHERE answer_id=? AND language_id=?",
                (aid, lang_id)
            )
            arow = cur.fetchone()

            cur.execute("SELECT time FROM question WHERE question_id=?", (qid,))
            trow = cur.fetchone()

            if qrow and arow and trow:
                question_text = qrow[0]
                answer_text = arow[0]
                time_val = trow[0]
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

    conn.close()
    print("全ベクトル保存完了")

# ----------------------------------------------------------------------------
# Retrieval
# ----------------------------------------------------------------------------

def rag(question: str, similarity_threshold: float = 0.3) -> Dict[int, Dict[str, Any]]:
    """
    言語検出に失敗/未対応の場合は例外を投げる
    成功時は rank-> [answer, question, time, similarity] を返す。
    similarity_threshold以下のスコアの結果は除外される。
    """
    # 言語検出（Linguaのみ、未対応/検出不可は例外）
    lang = detect_lang(question)  # 'ja' / 'en' / 'vi' / 'zh' / 'ko'
    print(f"検出言語: {lang}")

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

    query_vec = np.array(get_embedding(question)).astype("float32").reshape(1, -1)
    faiss.normalize_L2(query_vec)
    D, I = index.search(query_vec, 10)  # より多く取得して閾値でフィルタリング

    results: Dict[int, Dict[str, Any]] = {}
    ranked = sorted(zip(I[0], D[0]), key=lambda x: x[1], reverse=True)

    rank = 1
    # DB 接続（category 取得用）
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()
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
                    cur.execute("SELECT category_id FROM question WHERE question_id = ?", (qid,))
                    row = cur.fetchone()
                    if row:
                        cat_id = int(row[0])
                except Exception:
                    cat_id = None

            # 回答の最終編集時刻（answer.time）を取得
            ans_time = None
            if qa_id is not None:
                try:
                    cur.execute("SELECT answer_id FROM QA WHERE id = ?", (qa_id,))
                    qa_row = cur.fetchone()
                    if qa_row and qa_row[0] is not None:
                        ans_id = int(qa_row[0])
                        cur.execute("SELECT time FROM answer WHERE answer_id = ?", (ans_id,))
                        arow = cur.fetchone()
                        if arow:
                            ans_time = arow[0]
                except Exception:
                    ans_time = None

            results[rank] = {
                "answer": answer_text,
                "question": question_text,
                "time": time_val,
                "similarity": float(similarity),
                "question_id": qid,
                "category_id": cat_id,
                "answer_time": ans_time,
            }
            rank += 1

            # 最大5件まで
            if rank > 5:
                break

    print(f"類似度閾値 {similarity_threshold} 以上の結果: {len(results)}件")
    try:
        conn.close()
    except Exception:
        pass
    return results

# ----------------------------------------------------------------------------
# Prompt builders
# ----------------------------------------------------------------------------

def _build_prompt_ja(question_text: str, rag_qa: list, history_qa: list) -> str:
    # rag_qa の各要素は {sid:"S#", question, answer} を想定
    prompt = (
        "あなたは根拠付きで回答するアシスタントです。与えられたQ&Aコンテキスト以外の情報は使わず、"
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
        "- 回答は与えたコンテキストのみから作成。\n"
        "- 各文に少なくとも1つの出典ID [S#] を付与。\n"
        "- 実際に使った出典だけを used_source_ids に列挙（未使用は含めない）。\n"
        "- 可能なら根拠箇所を evidence.quotes に原文抜粋として含める（任意）。\n"
        "- 根拠が不足する場合は『十分な根拠がありません』と述べる。\n"
        "- 出力は次のJSONに厳密準拠し、これ以外は何も出力しない:\n"
        "{\n  \"answer\": \"文末ごとに [S1] のように出典IDを付与\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"原文抜粋\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_en(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "You answer with citations only from the provided Q&A context."
        " Every sentence must include at least one source ID. Output ONLY the JSON specified; do not reveal chain-of-thought.\n\n"
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
        "- Use ONLY the given context.\n"
        "- Add at least one source ID [S#] to each sentence.\n"
        "- List only actually used sources in used_source_ids.\n"
        "- Optionally include exact quotes in evidence.quotes.\n"
        "- If insufficient evidence, state 'Insufficient evidence.'.\n"
        "- Output exactly this JSON and nothing else:\n"
        "{\n  \"answer\": \"Sentences with [S1] style citations\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"verbatim quote\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_vi(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "Bạn phải trả lời kèm trích dẫn chỉ từ ngữ cảnh Q&A đã cung cấp."
        " Mỗi câu phải có ít nhất một mã nguồn [S#]. Chỉ xuất JSON theo mẫu, không tiết lộ quá trình suy nghĩ.\n\n"
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
        "- Chỉ dùng ngữ cảnh đã cho.\n"
        "- Thêm [S#] vào mỗi câu.\n"
        "- Chỉ liệt kê nguồn đã dùng trong used_source_ids.\n"
        "- Tùy chọn: evidence.quotes trích nguyên văn.\n"
        "- Nếu thiếu bằng chứng, nêu rõ 'Thiếu bằng chứng.'.\n"
        "- Chỉ xuất đúng JSON sau:\n"
        "{\n  \"answer\": \"Mỗi câu có trích dẫn [S1]\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"trích dẫn\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_zh(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "你必须仅使用提供的Q&A作为依据作答。每句话都必须附上至少一个来源ID [S#]。"
        " 只输出指定的JSON，不要输出思考过程。\n\n"
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
        "- 仅使用提供的上下文。\n"
        "- 每句话后附 [S#]。\n"
        "- used_source_ids 仅列出实际使用的来源。\n"
        "- 可选：在 evidence.quotes 中加入原文引文。\n"
        "- 若证据不足，请说明‘证据不足。’\n"
        "- 只输出如下 JSON：\n"
        "{\n  \"answer\": \"每句含 [S1] 引用\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"原文引文\"]} ]\n}\n"
    )
    return prompt


def _build_prompt_ko(question_text: str, rag_qa: list, history_qa: list) -> str:
    prompt = (
        "당신은 근거를 명시해 답변하는 어시스턴트입니다. 제공된 Q&A 외 정보는 사용하지 말고,"
        " 각 문장 끝에 최소 1개의 출처 ID를 붙이세요. 출력은 지정된 JSON만 허용됩니다.\n\n"
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
        "- 제공된 컨텍スト만 사용.\n"
        "- 각 문장에 [S#] 추가.\n"
        "- 실제 사용한 출처만 used_source_ids에 나열.\n"
        "- evidence.quotes에 원문 인용(선택).\n"
        "- 증거가 부족하면 ‘증거가 충분하지 않습니다’ 명시.\n"
        "- 다음 JSON만 출력:\n"
        "{\n  \"answer\": \"문장마다 [S1] 참고 표시\",\n  \"used_source_ids\": [\"S1\",\"S3\"],\n  \"evidence\": [ {\"source_id\": \"S1\", \"quotes\": [\"원문 인용\"]} ]\n}\n"
    )
    return prompt

# 検出言語ごとのビルダーマップ
_PROMPT_BUILDERS = {
    "ja": _build_prompt_ja,
    "en": _build_prompt_en,
    "vi": _build_prompt_vi,
    "zh": _build_prompt_zh,
    "ko": _build_prompt_ko,
}

# ----------------------------------------------------------------------------
# LLM helpers
# ----------------------------------------------------------------------------

def _llm(model: str = "gpt-4.1-mini", timeout_s: int = 20) -> ChatOpenAI:
    return ChatOpenAI(model=model, temperature=0.2, request_timeout=timeout_s)


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
    model: str = "gpt-4.1-mini",
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
    resp = _llm(model=model).invoke([HumanMessage(content=prompt)])
    content = (resp.content or "").strip()

    try:
        data = json.loads(content)
        answer_text = str(data.get("answer", "")).strip()
        used_ids = [str(x) for x in (data.get("used_source_ids") or [])]
        evidence = data.get("evidence") or []
        return {"answer": answer_text, "used_source_ids": used_ids, "evidence": evidence}
    except Exception:
        # フォールバック: そのままテキストを返し、全ての出典を使用扱い
        return {"answer": content, "used_source_ids": [x["sid"] for x in rag_with_sid], "evidence": []}


def answer_with_rag(
    question_text: str,
    history_qa: List[Tuple[str, str]],
    *,
    similarity_threshold: float = 0.3,
    max_history_in_prompt: int = 6,
    model: str = "gpt-4.1-mini",
) -> Dict[str, Any]:
    """Retrieve → generate. 統一フォーマットで返す。"""
    lang = "ja"
    try:
        lang = detect_lang(question_text)
    except Exception:
        pass

    # 検索
    results = rag(question_text, similarity_threshold=similarity_threshold)

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
                "わかっている範囲で簡潔に回答してください。\n\n"
                f"【質問】\n{question_text}\n"
            ),
            "en": (
                "No reference information was found. Avoid guessing and clearly state the information gap.\n"
                "Answer concisely only within what is known.\n\n"
                f"Question:\n{question_text}\n"
            ),
            "vi": (
                "Không tìm thấy thông tin tham chiếu. Tránh suy đoán và nêu rõ những phần còn thiếu thông tin.\n"
                "Vui lòng trả lời ngắn gọn trong phạm vi điều đã biết.\n\n"
                f"Câu hỏi:\n{question_text}\n"
            ),
            "zh": (
                "未找到可参考的信息。请避免猜测，明确说明信息不足之处。\n"
                "请在已知范围内简洁作答。\n\n"
                f"问题：\n{question_text}\n"
            ),
            "ko": (
                "참고할 정보를 찾지 못했습니다. 추측은 피하고 정보 부족을 명확히 밝혀주세요.\n"
                "아는 범위 내에서 간결하게 답변해주세요.\n\n"
                f"질문:\n{question_text}\n"
            ),
        }
        fallback_prompt = fallback_texts.get(lang, fallback_texts["ja"])  # 安全フォールバック
        resp = _llm(model=model).invoke([HumanMessage(content=fallback_prompt)])
        return {
            "type": "rag",
            "text": resp.content.strip(),
            "meta": {
                "lang": lang,
                "references": [],
                "similarity_threshold": similarity_threshold,
            },
        }

    gen = generate_answer_with_llm(
        question_text,
        references,
        history_qa,
        lang=lang,
        model=model,
        max_history_in_prompt=max_history_in_prompt,
    )

    answer_text = gen.get("answer", "").strip()
    used_ids = set(gen.get("used_source_ids", []))
    evidence = gen.get("evidence", [])
    used_references = [r for r in references if r.get("sid") in used_ids] if used_ids else references

    # Strip inline citation tags like [S1], [S2] from the displayed answer
    clean_text = re.sub(r"\s*\[S\d+\]", "", answer_text)
    clean_text = re.sub(r"\s{2,}", " ", clean_text).strip()

    return {
        "type": "rag",
        "text": clean_text,
        "meta": {
            "lang": lang,
            "references": used_references,
            "used_source_ids": list(used_ids) if used_ids else [r.get("sid") for r in references],
            "evidence": evidence,
            "similarity_threshold": similarity_threshold,
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
    model: str = "gpt-4.1-mini",
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

    """
    検出言語に合わせてプロンプトを切り替え、LLMへ投げる。
    ※ rag() 側でも言語検出・検証は済んでいるが、ここでも再判定して出力言語を確実化する。
    """
    # 言語判定（未対応/検出不可は上位へ例外伝播）
    lang = detect_lang(question_text)  # 'ja'|'en'|'vi'|'zh'|'ko'

    # ビルダー取得（理論上必ず存在するはずだが保険）
    builder = _PROMPT_BUILDERS.get(lang)
    if builder is None:
        raise UnsupportedLanguageError(f"未対応の言語が検出されました: {lang}")

    prompt = builder(question_text, rag_qa, history_qa)

    llm = ChatOpenAI(model="gpt-4.1-nano", temperature=0.3)
    response = llm.invoke([HumanMessage(content=prompt)])
    return response.content.strip()

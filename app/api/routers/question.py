from datetime import datetime
import os
import httpx
import langid
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Optional, Tuple
from config import language_mapping
from database_utils import get_db_cursor, get_placeholder
from api.routers.user import current_user_info
from api.services.agent_client import generate_answer_via_agent
from api.services.thread_history import load_thread_history
from api.services.thread_title import title_text
from models.schemas import Question
import json

router = APIRouter()
AGENT_API_BASE_URL = os.getenv("AGENT_API_BASE_URL", "http://agent:8001")

# --- Helpers ---------------------------------------------------------------
_OPENAI_KEY_MISSING_MESSAGES = {
    "日本語": "APIキーが設定されていません",
    "English": "API key is not set",
    "Tiếng Việt": "API key chưa được thiết lập",
    "中文": "尚未设置 API 密钥",
    "한국어": "API 키가 설정되지 않았습니다",
    "Português": "A chave de API não está configurada",
    "Español": "La clave de API no está configurada",
    "Tagalog": "Hindi naka-set ang API key",
    "Bahasa Indonesia": "Kunci API belum disetel",
}

_THREAD_TITLE_MAX_CHARS_BY_LANG = {
    # Japanese baseline
    "ja": 15,
    "zh": 15,
    "ko": 15,
    # Latin scripts: roughly equivalent visual density
    "en": 30,
    "vi": 24,
    "pt": 28,
    "es": 28,
    "tl": 26,
    "id": 26,
}
_THREAD_TITLE_LANG_CODE = {
    "日本語": "ja",
    "English": "en",
    "Tiếng Việt": "vi",
    "中文": "zh",
    "한국어": "ko",
    "Português": "pt",
    "Español": "es",
    "Tagalog": "tl",
    "Bahasa Indonesia": "id",
}
_UNTITLED_BY_LANGUAGE = {
    "日本語": "無題",
    "English": "Untitled",
    "Tiếng Việt": "Không tiêu đề",
    "中文": "无标题",
    "한국어": "제목 없음",
    "Português": "Sem título",
    "Español": "Sin título",
    "Tagalog": "Walang pamagat",
    "Bahasa Indonesia": "Tanpa judul",
}

_TITLE_LANG_ALLOWED = {"ja", "en", "vi", "zh", "ko", "pt", "es", "tl", "id"}


def _localize_runtime_error(detail: str, spoken_language: str) -> str:
    """Map known backend errors to localized user-facing messages."""
    normalized = (detail or "").lower()
    if "openai_api_key is not set" in normalized:
        return _OPENAI_KEY_MISSING_MESSAGES.get(
            spoken_language,
            _OPENAI_KEY_MISSING_MESSAGES["English"],
        )
    return detail


def _ensure_threads_has_thread_title_column() -> None:
    try:
        with get_db_cursor() as (cursor, conn):
            cursor.execute("""
                SELECT COUNT(*) AS cnt FROM information_schema.columns
                WHERE table_name = 'threads'
                AND column_name = 'thread_title'
            """)
            row = cursor.fetchone()
            if row['cnt'] == 0:
                cursor.execute("ALTER TABLE threads ADD COLUMN thread_title TEXT")
                conn.commit()
    except Exception:
        pass


def _fit_thread_title(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _fallback_thread_title(spoken_language: str) -> str:
    return _UNTITLED_BY_LANGUAGE.get(spoken_language, _UNTITLED_BY_LANGUAGE["English"])


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _parse_sse_chunk(raw_event: str) -> Tuple[Optional[str], Optional[dict]]:
    event_name = None
    data_lines: list[str] = []
    for line in raw_event.splitlines():
        if line.startswith("event:"):
            event_name = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())

    if not event_name:
        return None, None

    payload = {}
    if data_lines:
        try:
            payload = json.loads("\n".join(data_lines))
        except json.JSONDecodeError:
            payload = {"raw": "\n".join(data_lines)}
    return event_name, payload


def _to_agent_chat_history_text(history_qa: list[dict]) -> str:
    lines: list[str] = []
    for item in history_qa:
        question = (item.get("question") or "").strip()
        answer = (item.get("answer") or "").strip()
        rag_qa = item.get("rag_qa") or []
        if question:
            lines.append(f"human: {question}")
        if answer:
            lines.append(f"ai: {answer}")
        if isinstance(rag_qa, list):
            for idx, ref in enumerate(rag_qa, 1):
                if not isinstance(ref, dict):
                    continue
                ref_question = (ref.get("question") or "").strip()
                ref_answer = (ref.get("answer") or "").strip()
                if not ref_question and not ref_answer:
                    continue
                lines.append(f"ref_qa[{idx}].question: {ref_question}")
                lines.append(f"ref_qa[{idx}].answer: {ref_answer}")
    return "\n".join(lines)


def _generate_thread_title(question_text: str, spoken_language: str) -> str:
    lang_code = _THREAD_TITLE_LANG_CODE.get(spoken_language, "en")
    try:
        detected_iso, _ = langid.classify(question_text)
        normalized_iso = (detected_iso or "").strip().lower()
        if normalized_iso.startswith("zh"):
            normalized_iso = "zh"
        elif normalized_iso == "jp":
            normalized_iso = "ja"
        if normalized_iso in _TITLE_LANG_ALLOWED:
            lang_code = normalized_iso
    except Exception:
        pass

    max_chars = _THREAD_TITLE_MAX_CHARS_BY_LANG.get(lang_code, 15)
    source_text = question_text
    for _ in range(3):
        try:
            generated = title_text(
                source_text,
                lang_code,
                max_chars=max_chars,
                strict=True,
            )
            candidate = _fit_thread_title(generated)
            if candidate and len(candidate) <= max_chars:
                return candidate
            source_text = f"Shorten this title to <= {max_chars} chars:\n{generated}"
        except Exception:
            break
    return _fallback_thread_title(spoken_language)


def _ensure_thread_qa_has_rag_column() -> None:
    """Ensure thread_qa table has a rag_qa TEXT column to store JSON.
    Safe to call often; adds the column only if missing.
    """
    try:
        with get_db_cursor() as (cursor, conn):
            cursor.execute("""
                SELECT COUNT(*) AS cnt FROM information_schema.columns
                WHERE table_name = 'thread_qa'
                AND column_name = 'rag_qa'
            """)
            row = cursor.fetchone()
            if row['cnt'] == 0:
                cursor.execute("ALTER TABLE thread_qa ADD COLUMN rag_qa TEXT")
                conn.commit()

    except Exception:
        # Don't crash API path if migration fails; let main ops proceed.
        pass

def _ensure_thread_qa_has_type_column() -> None:
    """Ensure thread_qa table has a type TEXT column to store action type (e.g., 'rag')."""
    try:
        with get_db_cursor() as (cursor, conn):
            cursor.execute("""
                SELECT COUNT(*) AS cnt FROM information_schema.columns
                WHERE table_name = 'thread_qa'
                AND column_name = 'type'
            """)
            row = cursor.fetchone()
            if row['cnt'] == 0:
                cursor.execute("ALTER TABLE thread_qa ADD COLUMN type TEXT")
                conn.commit()
    except Exception:
        pass

@router.get("/get_translated_question")
async def get_translated_question(question_id: int, language_id: int, current_user: dict = Depends(current_user_info)):
    """
    翻訳済みの質問を取得する
    """
    print(f"リクエストデータ: question_id={question_id}, language_id={language_id}")  # デバッグログ

    # ユーザの言語情報を取得
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)

    if not language_id:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported spoken language: {spoken_language}"
        )

    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        # 翻訳済みの質問を取得
        cursor.execute(f"""
            SELECT texts FROM question_translation
            WHERE question_id = {ph} AND language_id = {ph}
        """, (question_id, language_id))
        translated_question = cursor.fetchone()

        if not translated_question:
            raise HTTPException(
                status_code=404,
                detail="指定された言語で翻訳済み質問が見つかりません"
            )
        return {"text": translated_question['texts']}

async def load_data_from_database():
    questions_and_answers = []
    
    try:
        with get_db_cursor() as (cursor, conn):
            cursor.execute("""SELECT question_translation.question_id, texts FROM question_translation
                JOIN question ON question_translation.question_id=question.question_id
                WHERE question.title='official' AND
                question_translation.language_id=1 AND
                question.public=1""")
            questions = cursor.fetchall()

            
            cursor.execute("SELECT texts FROM answer_translation WHERE language_id=1")
            answers = cursor.fetchall()
            
            if not questions:
                print("⚠️ No questions found in `question_translation` table")
            if not answers:
                print("⚠️ No answers found in `answer_translation` table")

            questions_and_answers = []
            for q_row, a_row in zip(questions, answers):
                questions_and_answers.append((q_row['question_id'], f"Q: {q_row['texts']}\nA: {a_row['texts']}"))

        print(f"✅ データベースから取得した Q&A の数: {len(questions_and_answers)}")

    except Exception as e:
        print(f"❌ データベースの読み込みエラー: {str(e)}")
    
    return questions_and_answers

@router.post("/create_thread")
async def create_thread(current_user: dict = Depends(current_user_info)):
    """
    空のスレッドを作成してIDを返す。最初の投稿前にUIから作成したいケース用。
    """
    user_id = current_user["id"]
    ph = get_placeholder()
    try:
        with get_db_cursor() as (cursor, conn):
            cursor.execute(
                f"INSERT INTO threads (user_id, last_updated) VALUES ({ph}, {ph}) RETURNING id",
                (user_id, datetime.now()),
            )
            new_id = cursor.fetchone()['id']
            conn.commit()
            return {"thread_id": int(new_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DBエラー: {str(e)}")

@router.post("/get_answer")
async def get_answer(request: Question, current_user: dict = Depends(current_user_info)):
    question_text = request.text
    req_thread_id = request.thread_id
    user_id = current_user["id"]

    ph = get_placeholder()
    try:
        # ---- 既存スレッドの検証 or 新規作成（AUTOINCREMENT） --------------------
        with get_db_cursor() as (cursor, conn):
            assigned_thread_id = None

            if req_thread_id is not None:
                cursor.execute(f"SELECT id, user_id FROM threads WHERE id = {ph}", (req_thread_id,))
                row = cursor.fetchone()
                if row:
                    if row['user_id'] != user_id:
                        raise HTTPException(status_code=403, detail="このスレッドにアクセスする権限がありません")
                    assigned_thread_id = req_thread_id

            if assigned_thread_id is None:
                cursor.execute(
                    f"INSERT INTO threads (user_id, last_updated) VALUES ({ph}, {ph}) RETURNING id",
                    (user_id, datetime.now()),
                )
                assigned_thread_id = cursor.fetchone()['id']
                conn.commit()

        # ---- 履歴の取得（逐次フローの reactive で参照するので先に取る） ----------
        history_qa = load_thread_history(assigned_thread_id, k=6)
        agent_chat_history_text = _to_agent_chat_history_text(history_qa)
        is_first_turn = len(history_qa) == 0
        generated_thread_title = None
        if is_first_turn:
            generated_thread_title = _generate_thread_title(
                question_text,
                current_user.get("spoken_language", "English"),
            )

        agent_resp = await generate_answer_via_agent(
            question_text,
            assigned_thread_id,
            agent_chat_history_text,
        )
        answer_text = (agent_resp.get("answer") or "").strip()
        agent_refs = agent_resp.get("ref_qa") or []
        rag_qa = [
            {"question": item.get("question", ""), "answer": item.get("answer", "")}
            for item in agent_refs
            if isinstance(item, dict)
        ]
        meta = {
            "references": rag_qa,
            "source": "agent",
        }
        action_type = "rag"

        # ---- DB 保存（thread_qa に rag_qa も入れる） ----------------------------
        _ensure_threads_has_thread_title_column()
        with get_db_cursor() as (cursor, conn):
            _ensure_thread_qa_has_rag_column()  # 既存のマイグレーションヘルパ
            _ensure_thread_qa_has_type_column() # 新規：type列
            # 必要なら「type」カラムを追加しても良い（下記コメント参照）
            try:
                cursor.execute(
                    f"""
                    INSERT INTO thread_qa (thread_id, question, answer, rag_qa, type)
                    VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
                    """,
                    (assigned_thread_id, question_text, answer_text, json.dumps(rag_qa, ensure_ascii=False), action_type),
                )
            except Exception:
                # 互換性: type列がない古い環境
                cursor.execute(
                    f"""
                    INSERT INTO thread_qa (thread_id, question, answer, rag_qa)
                    VALUES ({ph}, {ph}, {ph}, {ph})
                    """,
                    (assigned_thread_id, question_text, answer_text, json.dumps(rag_qa, ensure_ascii=False)),
                )
            if generated_thread_title:
                cursor.execute(
                    f"UPDATE threads SET last_updated = {ph}, thread_title = {ph} WHERE id = {ph}",
                    (datetime.now(), generated_thread_title, assigned_thread_id),
                )
            else:
                cursor.execute(
                    f"UPDATE threads SET last_updated = {ph} WHERE id = {ph}",
                    (datetime.now(), assigned_thread_id),
                )
            conn.commit()

        # ---- レスポンス -----------------------------------------------------------
        # meta.references をフィルタ済みに差し替え
        meta["references"] = rag_qa
        return {
            "thread_id": assigned_thread_id,
            "thread_title": generated_thread_title,
            "question": question_text,
            "answer": answer_text,
            "type": action_type,
            "meta": meta,
        }

    # ---- 例外ハンドリング（運用時に応じて整理） -----------------------------------
    except RuntimeError as e:
        error_detail = _localize_runtime_error(str(e), current_user.get("spoken_language", "English"))
        print(f"❌ Runtime error: {error_detail}")
        raise HTTPException(status_code=500, detail=error_detail)
    except HTTPException:
        raise
    except Exception as e:
        error_detail = f"内部エラー: {str(e)}"
        print(f"❌ {error_detail}")
        raise HTTPException(status_code=500, detail=error_detail)


@router.post("/get_answer_stream")
async def get_answer_stream(
    request: Question,
    current_user: dict = Depends(current_user_info),
):
    question_text = request.text
    req_thread_id = request.thread_id
    user_id = current_user["id"]

    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        assigned_thread_id = None

        if req_thread_id is not None:
            cursor.execute(f"SELECT id, user_id FROM threads WHERE id = {ph}", (req_thread_id,))
            row = cursor.fetchone()
            if row:
                if row["user_id"] != user_id:
                    raise HTTPException(status_code=403, detail="このスレッドにアクセスする権限がありません")
                assigned_thread_id = req_thread_id

        if assigned_thread_id is None:
            cursor.execute(
                f"INSERT INTO threads (user_id, last_updated) VALUES ({ph}, {ph}) RETURNING id",
                (user_id, datetime.now()),
            )
            assigned_thread_id = cursor.fetchone()["id"]
            conn.commit()

    history_qa = load_thread_history(assigned_thread_id, k=6)
    agent_chat_history_text = _to_agent_chat_history_text(history_qa)
    is_first_turn = len(history_qa) == 0
    generated_thread_title = None
    if is_first_turn:
        generated_thread_title = _generate_thread_title(
            question_text,
            current_user.get("spoken_language", "English"),
        )

    async def event_generator():
        answer_parts: list[str] = []
        rag_qa: list[dict] = []
        yield _sse_event(
            "thread_ready",
            {
                "thread_id": assigned_thread_id,
                "thread_title": generated_thread_title,
            },
        )

        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{AGENT_API_BASE_URL}/chat/stream",
                    json={
                        "question": question_text,
                        "thread_id": assigned_thread_id,
                        "chat_history_text": agent_chat_history_text,
                    },
                ) as response:
                    response.raise_for_status()
                    buffer = ""
                    async for chunk in response.aiter_text():
                        buffer += chunk
                        while "\n\n" in buffer:
                            raw_event, buffer = buffer.split("\n\n", 1)
                            event_name, payload = _parse_sse_chunk(raw_event)
                            if not event_name:
                                continue

                            if event_name == "token":
                                token = payload.get("content", "")
                                if token:
                                    answer_parts.append(token)
                            elif event_name == "end":
                                rag_qa = payload.get("ref_qa", []) or []

                            if event_name != "end":
                                yield _sse_event(event_name, payload)

            answer_text = "".join(answer_parts).strip()

            _ensure_threads_has_thread_title_column()
            with get_db_cursor() as (cursor, conn):
                _ensure_thread_qa_has_rag_column()
                _ensure_thread_qa_has_type_column()
                try:
                    cursor.execute(
                        f"""
                        INSERT INTO thread_qa (thread_id, question, answer, rag_qa, type)
                        VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
                        """,
                        (
                            assigned_thread_id,
                            question_text,
                            answer_text,
                            json.dumps(rag_qa, ensure_ascii=False),
                            "rag",
                        ),
                    )
                except Exception:
                    cursor.execute(
                        f"""
                        INSERT INTO thread_qa (thread_id, question, answer, rag_qa)
                        VALUES ({ph}, {ph}, {ph}, {ph})
                        """,
                        (
                            assigned_thread_id,
                            question_text,
                            answer_text,
                            json.dumps(rag_qa, ensure_ascii=False),
                        ),
                    )

                if generated_thread_title:
                    cursor.execute(
                        f"UPDATE threads SET last_updated = {ph}, thread_title = {ph} WHERE id = {ph}",
                        (datetime.now(), generated_thread_title, assigned_thread_id),
                    )
                else:
                    cursor.execute(
                        f"UPDATE threads SET last_updated = {ph} WHERE id = {ph}",
                        (datetime.now(), assigned_thread_id),
                    )
                conn.commit()

            yield _sse_event(
                "end",
                {
                    "thread_id": assigned_thread_id,
                    "thread_title": generated_thread_title,
                    "answer": answer_text,
                    "ref_qa": rag_qa,
                    "meta": {
                        "references": rag_qa,
                        "source": "agent",
                    },
                },
            )
        except Exception as e:
            yield _sse_event("error", {"message": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@router.get("/get_translated_answer")
async def get_translated_answer(
    answer_id: int = Query(..., description="Answer ID"),
    current_user: dict = Depends(current_user_info)
):
    """
    翻訳済みの回答を取得する
    ユーザの言語情報を基に language_id を設定
    """
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)

    if not language_id:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported spoken language: {spoken_language}"
        )

    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(f"""
            SELECT texts FROM answer_translation
            WHERE answer_id = {ph} AND language_id = {ph}
        """, (answer_id, language_id))
        translated_answer = cursor.fetchone()

        if not translated_answer:
            raise HTTPException(
                status_code=404,
                detail="指定された言語で翻訳済み回答が見つかりません"
            )

        return {"text": translated_answer['texts']}

@router.get("/get_qa")
async def get_qa(
    question_id: int,
    current_user: dict = Depends(current_user_info)
):
    """
    質問IDに基づいて質問と回答を取得する
    """
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)

    if not language_id:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported spoken language: {spoken_language}"
        )

    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        # 質問を取得
        cursor.execute(f"""
            SELECT q.question_id, qt.texts, q.title, q.time, c.description
            FROM question q
            JOIN question_translation qt ON q.question_id = qt.question_id
            JOIN category c ON q.category_id = c.id
            WHERE q.question_id = {ph} AND qt.language_id = {ph}
        """, (question_id, language_id))
        question_row = cursor.fetchone()

        if not question_row:
            raise HTTPException(status_code=404, detail="質問が見つかりません")

        question_data = {
            "question_id": question_row['question_id'],
            "text": question_row['texts'],
            "title": question_row['title'],
            "time": question_row['time'],
            "category": question_row['description']
        }

        # 回答を取得
        cursor.execute(f"""
            SELECT a.answer_id, at.texts, a.time
            FROM answer a
            JOIN answer_translation at ON a.answer_id = at.answer_id
            WHERE a.question_id = {ph} AND at.language_id = {ph}
        """, (question_id, language_id))
        answers = cursor.fetchall()

        answer_data = []
        for answer in answers:
            answer_data.append({
                "answer_id": answer['answer_id'],
                "text": answer['texts'],
                "time": answer['time']
            })

    return {
        "question": question_data,
        "answers": answer_data
    }

@router.get("/get_qa_list")
async def get_qa_list(
    mine: bool = Query(False, description="自分の質問のみを取得するかどうか"),
    category_id: int = Query(None, description="カテゴリIDでフィルタリング"),
    current_user: dict = Depends(current_user_info)
):
    """
    質問の一覧を追加日順で取得（オプションで自分の質問のみ、カテゴリ絞り込み）
    """
    spoken_language = current_user["spoken_language"]
    user_id = current_user["id"]
    language_id = language_mapping.get(spoken_language)

    if not language_id:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported spoken language: {spoken_language}"
        )

    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        # SQL構築
        query = f"""
            SELECT q.question_id, qt.texts, q.title, q.time, c.description
            FROM question q
            JOIN question_translation qt ON q.question_id = qt.question_id
            JOIN category c ON q.category_id = c.id
            WHERE qt.language_id = {ph}
        """
        params = [language_id]

        if mine:
            query += f" AND q.user_id = {ph}"
            params.append(user_id)

        if category_id is not None:
            query += f" AND q.category_id = {ph}"
            params.append(category_id)

        query += " ORDER BY q.time DESC"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        qa_list = []
        for row in rows:
            qa_list.append({
                "question_id": row['question_id'],
                "text": row['texts'],
                "title": row['title'],
                "time": row['time'],
                "category": row['description']
            })
            
    return {"qa_list": qa_list}

@router.get("/get_user_threads")
async def get_user_threads(current_user: dict = Depends(current_user_info)):
    """
    ユーザーのスレッド一覧を最新順で取得
    """
    user_id = current_user["id"]
    
    ph = get_placeholder()
    try:
        with get_db_cursor() as (cursor, conn):
            _ensure_threads_has_thread_title_column()
            cursor.execute(f"""
                SELECT id, last_updated, thread_title FROM threads
                WHERE user_id = {ph}
                ORDER BY last_updated DESC
            """, (user_id,))
            threads_data = cursor.fetchall()
            
            threads = []
            for thread_data in threads_data:
                thread_id = thread_data['id']
                last_updated = thread_data['last_updated']
                
                title = (thread_data.get("thread_title") or "").strip()
                if not title:
                    # 既存スレッドの補完: 初回質問からタイトルを生成して保存
                    cursor.execute(f"""
                        SELECT question FROM thread_qa
                        WHERE thread_id = {ph}
                        ORDER BY created_at ASC
                        LIMIT 1
                    """, (thread_id,))
                    first_question = cursor.fetchone()
                    if first_question:
                        q_text = first_question['question']
                        title = _generate_thread_title(
                            q_text,
                            current_user.get("spoken_language", "English"),
                        )
                        try:
                            cursor.execute(
                                f"UPDATE threads SET thread_title = {ph} WHERE id = {ph}",
                                (title, thread_id),
                            )
                            conn.commit()
                        except Exception:
                            pass
                    else:
                        title = _fallback_thread_title(current_user.get("spoken_language", "English"))
                
                threads.append({
                    "thread_id": thread_id,
                    "title": title,
                    "last_updated": last_updated
                })
            
            return {"threads": threads}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DBエラー: {str(e)}")

@router.get("/get_thread_messages/{thread_id}")
async def get_thread_messages(thread_id: str, current_user: dict = Depends(current_user_info)):
    """
    指定されたスレッドのメッセージ履歴を取得
    """
    user_id = current_user["id"]
    
    ph = get_placeholder()
    try:
        with get_db_cursor() as (cursor, conn):
            _ensure_thread_qa_has_rag_column()
            _ensure_thread_qa_has_type_column()
            
            # スレッドの所有者確認
            cursor.execute(f"SELECT user_id FROM threads WHERE id = {ph}", (thread_id,))
            thread_data = cursor.fetchone()
            
            if not thread_data:
                raise HTTPException(status_code=404, detail="スレッドが見つかりません")
            
            if thread_data['user_id'] != user_id:
                raise HTTPException(status_code=403, detail="このスレッドにアクセスする権限がありません")
        
            # メッセージ履歴を取得（rag_qa も返す）
            cursor.execute(
                f"""
                SELECT question, answer, created_at, rag_qa, COALESCE(type, '') as type
                FROM thread_qa
                WHERE thread_id = {ph}
                ORDER BY created_at ASC
                """,
                (thread_id,),
            )
            messages_data = cursor.fetchall()
            
            messages = []
            for row in messages_data:
                question = row['question']
                answer = row['answer']
                created_at = row['created_at']
                rag_qa_text = row['rag_qa']
                msg_type = row['type'] if 'type' in row else ''
            
                rag_val = None
                if rag_qa_text:
                    try:
                        rag_val = json.loads(rag_qa_text)
                    except Exception:
                        rag_val = None
                messages.append({
                    "question": question,
                    "answer": answer,
                    "created_at": created_at,
                    "rag_qa": rag_val,
                    "type": msg_type,
                })
            
            return {"messages": messages}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部エラー: {str(e)}")

@router.delete("/delete_thread/{thread_id}")
async def delete_thread(thread_id: str, current_user: dict = Depends(current_user_info)):
    """
    指定されたスレッドとその関連メッセージを削除
    """
    user_id = current_user["id"]
    
    ph = get_placeholder()
    try:
        with get_db_cursor() as (cursor, conn):
            # スレッドの所有者確認
            cursor.execute(f"SELECT user_id FROM threads WHERE id = {ph}", (thread_id,))
            thread_data = cursor.fetchone()
            
            if not thread_data:
                raise HTTPException(status_code=404, detail="スレッドが見つかりません")
            
            if thread_data['user_id'] != user_id:
                raise HTTPException(status_code=403, detail="このスレッドを削除する権限がありません")
    
            # 関連するメッセージを削除
            cursor.execute(f"DELETE FROM thread_qa WHERE thread_id = {ph}", (thread_id,))
            
            # スレッドを削除
            cursor.execute(f"DELETE FROM threads WHERE id = {ph}", (thread_id,))
            
            conn.commit()
            
            return {"message": "スレッドが正常に削除されました", "thread_id": thread_id}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部エラー: {str(e)}")

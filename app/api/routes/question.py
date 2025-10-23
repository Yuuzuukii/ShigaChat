from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from config import language_mapping
from database_utils import get_db_cursor, get_placeholder
from api.routes.user import current_user_info
from models.schemas import Question
from api.utils.RAG import (
    LanguageDetectionError,
    UnsupportedLanguageError,
    answer_with_rag,
)
import json

router = APIRouter()

# --- Helpers ---------------------------------------------------------------
def _ensure_thread_qa_has_rag_column() -> None:
    """Ensure thread_qa table has a rag_qa TEXT column to store JSON.
    Safe to call often; adds the column only if missing.
    """
    try:
        with get_db_cursor() as (cursor, conn):
            cursor.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'thread_qa' 
                AND COLUMN_NAME = 'rag_qa'
            """)
            row = cursor.fetchone()
            cnt = row['COUNT(*)'] if isinstance(row, dict) and 'COUNT(*)' in row else (list(row.values())[0] if isinstance(row, dict) else row[0])
            if cnt == 0:
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
                SELECT COUNT(*) FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'thread_qa' 
                AND COLUMN_NAME = 'type'
            """)
            row = cursor.fetchone()
            cnt = row['COUNT(*)'] if isinstance(row, dict) and 'COUNT(*)' in row else (list(row.values())[0] if isinstance(row, dict) else row[0])
            if cnt == 0:
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
                WHERE question.title="official" AND
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
            for (question_id, question_text), (answer_text,) in zip(questions, answers):
                questions_and_answers.append((question_id, f"Q: {question_text}\nA: {answer_text}"))

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
                f"INSERT INTO threads (user_id, last_updated) VALUES ({ph}, {ph})",
                (user_id, datetime.now()),
            )
            new_id = cursor.lastrowid
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
                    f"INSERT INTO threads (user_id, last_updated) VALUES ({ph}, {ph})",
                    (user_id, datetime.now()),
                )
                assigned_thread_id = cursor.lastrowid
                conn.commit()

        # ---- 履歴の取得（逐次フローの reactive で参照するので先に取る） ----------
        with get_db_cursor() as (cursor, conn):
            cursor.execute(f"""
                SELECT question, answer FROM thread_qa
                WHERE thread_id = {ph}
                ORDER BY created_at DESC
                LIMIT 6
            """, (assigned_thread_id,))
            past_qa_rows = cursor.fetchall()
        history_qa = list(reversed(past_qa_rows))  # [(user, bot), ...] の昇順に

        # ---- 回答生成：RAG 専用に固定 ---------------------------------------
        # UIから受け取った similarity_threshold（未指定時は 0.3）を適用
        sim_th = request.similarity_threshold if (hasattr(request, 'similarity_threshold') and request.similarity_threshold is not None) else 0.3
        try:
            sim_th = max(0.0, min(1.0, float(sim_th)))
        except Exception:
            sim_th = 0.3

        # モデルとreasoning_effortの取得
        model = request.model if (hasattr(request, 'model') and request.model) else "gpt-4.1-nano"
        reasoning_effort = request.reasoning_effort if (hasattr(request, 'reasoning_effort') and request.reasoning_effort) else "low"

        resp = answer_with_rag(
            question_text=question_text,
            history_qa=history_qa,
            similarity_threshold=sim_th,
            max_history_in_prompt=6,
            model=model,
            reasoning_effort=reasoning_effort,
        )

        # RAG専用応答を展開
        answer_text = resp.get("text", "").strip()
        meta = resp.get("meta", {}) or {}
        references = meta.get("references", []) if isinstance(meta, dict) else []
        action_type = "rag"

        # ---- 保存用に rag_qa を JSON 化 -------------------------------------
        rag_qa = references if isinstance(references, list) else []

        # ---- DB 保存（thread_qa に rag_qa も入れる） ----------------------------
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
            cursor.execute(
                f"UPDATE threads SET last_updated = {ph} WHERE id = {ph}",
                (datetime.now(), assigned_thread_id),
            )
            conn.commit()

        # ---- レスポンス -----------------------------------------------------------
        return {
            "thread_id": assigned_thread_id,
            "question": question_text,
            "answer": answer_text,
            "type": action_type,          # 追加：UI が出し分けできるように
            "meta": meta,                 # 追加：lang / references / threshold など
        }

    # ---- 例外ハンドリング（運用時に応じて整理） -----------------------------------
    except UnsupportedLanguageError as e:
        error_detail = f"Unsupported language detected: {str(e)}"
        print(f"❌ {error_detail}")
        raise HTTPException(status_code=400, detail=error_detail)
    except LanguageDetectionError as e:
        error_detail = f"Language detection failed: {str(e)}"
        print(f"❌ {error_detail}")
        raise HTTPException(status_code=400, detail=error_detail)
    except RuntimeError as e:
        error_detail = str(e)
        print(f"❌ Runtime error: {error_detail}")
        raise HTTPException(status_code=500, detail=error_detail)
    except HTTPException:
        raise
    except Exception as e:
        error_detail = f"内部エラー: {str(e)}"
        print(f"❌ {error_detail}")
        raise HTTPException(status_code=500, detail=error_detail)

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
            cursor.execute(f"""
                SELECT id, last_updated FROM threads
                WHERE user_id = {ph}
                ORDER BY last_updated DESC
            """, (user_id,))
            threads_data = cursor.fetchall()
            
            threads = []
            for thread_data in threads_data:
                thread_id = thread_data['id']
                last_updated = thread_data['last_updated']
                
                # 各スレッドの最初の質問を取得してタイトルにする
                cursor.execute(f"""
                    SELECT question FROM thread_qa
                    WHERE thread_id = {ph}
                    ORDER BY created_at ASC
                    LIMIT 1
                """, (thread_id,))
                first_question = cursor.fetchone()
                
                if first_question:
                    q_text = first_question['question']
                    title = q_text[:50] + "..." if len(q_text) > 50 else q_text
                else:
                    title = "無題のスレッド"
                
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

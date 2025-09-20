# データベースの中身を見たい時、uwsgiコンテナの中（exec）で以下を実行
"""
apt-get update
apt-get install -y sqlite3
sqlite3 ShigaChat.db
"""

import os
import sqlite3
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from langdetect import detect
from langdetect.lang_detect_exception import LangDetectException
from config import DATABASE, OPENAI_API_KEY, language_mapping
from api.routes.user import current_user_info
from api.routes.category import categorize_question
from models.schemas import SimpleQuestion, QuestionRequest, Question, AnswerRequest
from api.utils.security import detect_privacy_info
from api.utils.translator import question_translate, answer_translate
from api.utils.RAG import rag, generate_answer_with_llm
from api.utils.RAG import (
    rag,
    LanguageDetectionError,
    UnsupportedLanguageError,
    answer_with_rag,
    detect_lang,
)
import json

router = APIRouter()

# --- Helpers ---------------------------------------------------------------
def _ensure_thread_qa_has_rag_column(conn: sqlite3.Connection) -> None:
    """Ensure thread_qa table has a rag_qa TEXT column to store JSON.
    Safe to call often; adds the column only if missing.
    """
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(thread_qa)")
        cols = [row[1] for row in cur.fetchall()]  # row[1] = name
        if "rag_qa" not in cols:
            cur.execute("ALTER TABLE thread_qa ADD COLUMN rag_qa TEXT")
            conn.commit()
    except Exception:
        # Don't crash API path if migration fails; let main ops proceed.
        pass

def _ensure_thread_qa_has_type_column(conn: sqlite3.Connection) -> None:
    """Ensure thread_qa table has a type TEXT column to store action type (e.g., 'rag')."""
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(thread_qa)")
        cols = [row[1] for row in cur.fetchall()]  # row[1] = name
        if "type" not in cols:
            cur.execute("ALTER TABLE thread_qa ADD COLUMN type TEXT")
            conn.commit()
    except Exception:
        pass

@router.get("/get_translated_question")
def get_translated_question(question_id: int, language_id: int, current_user: dict = Depends(current_user_info)):
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

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # 翻訳済みの質問を取得
        cursor.execute("""
            SELECT texts FROM question_translation
            WHERE question_id = ? AND language_id = ?
        """, (question_id, language_id))
        translated_question = cursor.fetchone()

        if not translated_question:
            raise HTTPException(
                status_code=404,
                detail="指定された言語で翻訳済み質問が見つかりません"
            )

        return {"text": translated_question[0]}

def load_data_from_database():
    if not os.path.exists(DATABASE):
        raise FileNotFoundError(f"Database not found: {DATABASE}")

    questions_and_answers = []
    
    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
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

    except sqlite3.Error as e:
        print(f"❌ データベースの読み込みエラー: {str(e)}")
    
    return questions_and_answers

@router.post("/create_thread")
def create_thread(current_user: dict = Depends(current_user_info)):
    """
    空のスレッドを作成してIDを返す。最初の投稿前にUIから作成したいケース用。
    """
    user_id = current_user["id"]
    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO threads (user_id, last_updated) VALUES (?, ?)",
                (user_id, datetime.now()),
            )
            new_id = cursor.lastrowid
            conn.commit()
            return {"thread_id": int(new_id)}
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DBエラー: {str(e)}")

@router.post("/get_answer")
async def get_answer(request: Question, current_user: dict = Depends(current_user_info)):
    question_text = request.text
    req_thread_id = request.thread_id
    user_id = current_user["id"]

    try:
        # ---- 既存スレッドの検証 or 新規作成（AUTOINCREMENT） --------------------
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            assigned_thread_id = None

            if req_thread_id is not None:
                cursor.execute("SELECT id, user_id FROM threads WHERE id = ?", (req_thread_id,))
                row = cursor.fetchone()
                if row:
                    if row[1] != user_id:
                        raise HTTPException(status_code=403, detail="このスレッドにアクセスする権限がありません")
                    assigned_thread_id = req_thread_id

            if assigned_thread_id is None:
                cursor.execute(
                    "INSERT INTO threads (user_id, last_updated) VALUES (?, ?)",
                    (user_id, datetime.now()),
                )
                assigned_thread_id = cursor.lastrowid
                conn.commit()

        # ---- 履歴の取得（逐次フローの reactive で参照するので先に取る） ----------
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT question, answer FROM thread_qa
                WHERE thread_id = ?
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

        resp = answer_with_rag(
            question_text=question_text,
            history_qa=history_qa,
            similarity_threshold=sim_th,
            max_history_in_prompt=6,
            model="gpt-4.1-mini",
        )

        # RAG専用応答を展開
        answer_text = resp.get("text", "").strip()
        meta = resp.get("meta", {}) or {}
        references = meta.get("references", []) if isinstance(meta, dict) else []
        action_type = "rag"

        # ---- 保存用に rag_qa を JSON 化 -------------------------------------
        rag_qa = references if isinstance(references, list) else []

        # ---- DB 保存（thread_qa に rag_qa も入れる） ----------------------------
        with sqlite3.connect(DATABASE) as conn:
            _ensure_thread_qa_has_rag_column(conn)  # 既存のマイグレーションヘルパ
            _ensure_thread_qa_has_type_column(conn) # 新規：type列
            # 必要なら「type」カラムを追加しても良い（下記コメント参照）
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    INSERT INTO thread_qa (thread_id, question, answer, rag_qa, type)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (assigned_thread_id, question_text, answer_text, json.dumps(rag_qa, ensure_ascii=False), action_type),
                )
            except sqlite3.OperationalError:
                # 互換性: type列がない古い環境
                cursor.execute(
                    """
                    INSERT INTO thread_qa (thread_id, question, answer, rag_qa)
                    VALUES (?, ?, ?, ?)
                    """,
                    (assigned_thread_id, question_text, answer_text, json.dumps(rag_qa, ensure_ascii=False)),
                )
            cursor.execute(
                "UPDATE threads SET last_updated = ? WHERE id = ?",
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
    except sqlite3.Error as e:
        error_detail = f"DBエラー: {str(e)}"
        print(f"❌ {error_detail}")
        raise HTTPException(status_code=500, detail=error_detail)
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
def get_translated_answer(
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

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT texts FROM answer_translation
            WHERE answer_id = ? AND language_id = ?
        """, (answer_id, language_id))
        translated_answer = cursor.fetchone()

        if not translated_answer:
            raise HTTPException(
                status_code=404,
                detail="指定された言語で翻訳済み回答が見つかりません"
            )

        return {"text": translated_answer[0]}

@router.get("/get_qa")
def get_qa(
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

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # 質問を取得
        cursor.execute("""
            SELECT q.question_id, qt.texts, q.title, q.time, c.description
            FROM question q
            JOIN question_translation qt ON q.question_id = qt.question_id
            JOIN category c ON q.category_id = c.id
            WHERE q.question_id = ? AND qt.language_id = ?
        """, (question_id, language_id))
        question_row = cursor.fetchone()

        if not question_row:
            raise HTTPException(status_code=404, detail="質問が見つかりません")

        question_data = {
            "question_id": question_row[0],
            "text": question_row[1],
            "title": question_row[2],
            "time": question_row[3],
            "category": question_row[4]
        }

        # 回答を取得
        cursor.execute("""
            SELECT a.answer_id, at.texts, a.time
            FROM answer a
            JOIN answer_translation at ON a.answer_id = at.answer_id
            WHERE a.question_id = ? AND at.language_id = ?
        """, (question_id, language_id))
        answers = cursor.fetchall()

        answer_data = []
        for answer in answers:
            answer_data.append({
                "answer_id": answer[0],
                "text": answer[1],
                "time": answer[2]
            })

    return {
        "question": question_data,
        "answers": answer_data
    }

@router.get("/get_qa_list")
def get_qa_list(
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

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # SQL構築
        query = """
            SELECT q.question_id, qt.texts, q.title, q.time, c.description
            FROM question q
            JOIN question_translation qt ON q.question_id = qt.question_id
            JOIN category c ON q.category_id = c.id
            WHERE qt.language_id = ?
        """
        params = [language_id]

        if mine:
            query += " AND q.user_id = ?"
            params.append(user_id)

        if category_id is not None:
            query += " AND q.category_id = ?"
            params.append(category_id)

        query += " ORDER BY q.time DESC"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        qa_list = [{
            "question_id": row[0],
            "text": row[1],
            "title": row[2],
            "time": row[3],
            "category": row[4]
        } for row in rows]

    return {"qa_list": qa_list}

@router.get("/get_user_threads")
def get_user_threads(current_user: dict = Depends(current_user_info)):
    """
    ユーザーのスレッド一覧を最新順で取得
    """
    user_id = current_user["id"]
    
    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, last_updated FROM threads
                WHERE user_id = ?
                ORDER BY last_updated DESC
            """, (user_id,))
            threads_data = cursor.fetchall()
            
            threads = []
            for thread_id, last_updated in threads_data:
                # 各スレッドの最初の質問を取得してタイトルにする
                cursor.execute("""
                    SELECT question FROM thread_qa
                    WHERE thread_id = ?
                    ORDER BY created_at ASC
                    LIMIT 1
                """, (thread_id,))
                first_question = cursor.fetchone()
                
                title = first_question[0][:50] + "..." if first_question and len(first_question[0]) > 50 else (first_question[0] if first_question else "無題のスレッド")
                
                threads.append({
                    "thread_id": thread_id,
                    "title": title,
                    "last_updated": last_updated
                })
            
            return {"threads": threads}
            
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DBエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部エラー: {str(e)}")

@router.get("/get_thread_messages/{thread_id}")
def get_thread_messages(thread_id: str, current_user: dict = Depends(current_user_info)):
    """
    指定されたスレッドのメッセージ履歴を取得
    """
    user_id = current_user["id"]
    
    try:
        import json
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            _ensure_thread_qa_has_rag_column(conn)
            _ensure_thread_qa_has_type_column(conn)
            
            # スレッドの所有者確認
            cursor.execute("SELECT user_id FROM threads WHERE id = ?", (thread_id,))
            thread_data = cursor.fetchone()
            
            if not thread_data:
                raise HTTPException(status_code=404, detail="スレッドが見つかりません")
            
            if thread_data[0] != user_id:
                raise HTTPException(status_code=403, detail="このスレッドにアクセスする権限がありません")
            
            # メッセージ履歴を取得（rag_qa も返す）
            cursor.execute(
                """
                SELECT question, answer, created_at, rag_qa, COALESCE(type, '') as type
                FROM thread_qa
                WHERE thread_id = ?
                ORDER BY created_at ASC
                """,
                (thread_id,),
            )
            messages_data = cursor.fetchall()
            
            messages = []
            for row in messages_data:
                # Support both with and without type column
                if len(row) >= 5:
                    question, answer, created_at, rag_qa_text, msg_type = row
                else:
                    question, answer, created_at, rag_qa_text = row
                    msg_type = ""
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
            
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DBエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部エラー: {str(e)}")

@router.delete("/delete_thread/{thread_id}")
def delete_thread(thread_id: str, current_user: dict = Depends(current_user_info)):
    """
    指定されたスレッドとその関連メッセージを削除
    """
    user_id = current_user["id"]
    
    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            
            # スレッドの所有者確認
            cursor.execute("SELECT user_id FROM threads WHERE id = ?", (thread_id,))
            thread_data = cursor.fetchone()
            
            if not thread_data:
                raise HTTPException(status_code=404, detail="スレッドが見つかりません")
            
            if thread_data[0] != user_id:
                raise HTTPException(status_code=403, detail="このスレッドを削除する権限がありません")
            
            # 関連するメッセージを削除
            cursor.execute("DELETE FROM thread_qa WHERE thread_id = ?", (thread_id,))
            
            # スレッドを削除
            cursor.execute("DELETE FROM threads WHERE id = ?", (thread_id,))
            
            conn.commit()
            
            return {"message": "スレッドが正常に削除されました", "thread_id": thread_id}
            
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DBエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部エラー: {str(e)}")

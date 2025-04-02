import sqlite3
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from config import DATABASE, language_mapping
from api.routes.user import current_user_info, get_current_user
from models.schemas import QuestionRequest

router = APIRouter()

@router.get("/get_posted_question")
def get_posted_question(language_id: int, current_user: dict = Depends(current_user_info)):
    user_id = current_user["id"]
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # クエリ実行
        cursor.execute(
            """
                SELECT 
                    q.question_id, 
                    q.public,  -- 🔹 questionテーブルから `public` を取得（固定）
                    qt.texts AS question_text, 
                    q.time,
                    q.category_id,
                    qa.answer_id, 
                    at.texts AS answer_text
                FROM question AS q
                JOIN question_translation AS qt ON q.question_id = qt.question_id
                JOIN QA AS qa ON q.question_id = qa.question_id
                JOIN answer_translation AS at ON qa.answer_id = at.answer_id
                WHERE q.user_id = ?
                AND qt.language_id = ?
                AND at.language_id = ?
                ORDER BY q.time DESC
            """, (user_id, language_id, language_id)
        )

        results = cursor.fetchall()

        # データ構造を整理
        viewed_questions = {}
        for row in results:
            question_id = row[0]
            public_status = row[1]  # 🔹 言語ごとに変化しない `public` の値

            if question_id not in viewed_questions:
                viewed_questions[question_id] = {
                    "question_id": question_id,
                    "質問": row[2],  # 翻訳された質問テキスト
                    "time": row[3],
                    "public": public_status,  # 🔹 `public` の値を固定
                    "category_id": row[4],
                    "answers": {}
                }
            # 回答を answer_id をキーにしてユニークにする
            answer_id = row[5]
            if answer_id not in viewed_questions[question_id]["answers"]:
                viewed_questions[question_id]["answers"][answer_id] = {
                    "answer_id": answer_id,
                    "回答": row[6]  # 翻訳された回答テキスト
                }

        # answers をリストに変換
        for question in viewed_questions.values():
            question["answers"] = list(question["answers"].values())

        return list(viewed_questions.values())


@router.get("/get_viewed_question")
def get_viewed_question(language_id: int, current_user: dict = Depends(current_user_info)):
    """
    ユーザーの閲覧履歴を取得し、指定された言語で質問と回答を返す。
    """
    user_id = current_user["id"]
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # クエリ実行
        cursor.execute(
            """
                SELECT 
                    question.question_id, 
                    question_translation.texts AS question_text, 
                    history.time,
                    question.title,
                    QA.answer_id, 
                    answer_translation.texts AS answer_text,
                    question.category_id
                FROM history
                JOIN QA ON history.QA_id = QA.id
                JOIN question ON QA.question_id = question.question_id
                JOIN question_translation ON question.question_id = question_translation.question_id
                JOIN answer_translation ON QA.answer_id = answer_translation.answer_id
                WHERE history.user_id = ? 
                AND question_translation.language_id = ? 
                AND answer_translation.language_id = ?
                ORDER BY history.time DESC
            """, (user_id, language_id, language_id)
        )
        results = cursor.fetchall()

        # データ構造を整理
        viewed_questions = {}
        for row in results:
            question_id = row[0]
            if question_id not in viewed_questions:
                viewed_questions[question_id] = {
                    "question_id": row[0],
                    "質問": row[1],  # 翻訳された質問テキスト
                    "time": row[2],
                    "title": row[3],
                    "category_id": row[6],
                    "answers": {}
                }
            # 回答を answer_id をキーにしてユニークにする
            answer_id = row[4]
            if answer_id not in viewed_questions[question_id]["answers"]:
                viewed_questions[question_id]["answers"][answer_id] = {
                    "answer_id": answer_id,
                    "回答": row[5]  # 翻訳された回答テキスト
                }

        # answers をリストに変換
        for question in viewed_questions.values():
            question["answers"] = list(question["answers"].values())

        return list(viewed_questions.values())

@router.delete("/clear_history")
def clear_history(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    cursor = sqlite3.connect(DATABASE)
    cursor.execute(
        """
            DELETE FROM history WHERE user_id = ?
        """,(user_id,)
    )
    cursor.commit()
    return {"message":"閲覧履歴が削除されました"}

@router.post("/add_history")
def add_to_history(request: QuestionRequest, current_user: dict = Depends(get_current_user)):
    """
    質問IDを受け取り、該当する質問を履歴に追加します。
    """
    
    user_id = current_user["id"]
    question_id = request.question_id

    try:
        add_history(question_id, user_id)
        return {"message": "履歴に追加されました"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"履歴追加中にエラーが発生しました: {str(e)}")

def add_history(question_id: int, user_id: int):
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # QA.idを取得
        cursor.execute("""
            SELECT QA.id FROM QA 
            JOIN answer ON QA.answer_id = answer.id
            WHERE question_id = ?
            ORDER BY answer.time DESC
        """, (question_id,))
        qa_id_row = cursor.fetchone()

        if not qa_id_row:
            raise HTTPException(status_code=404, detail="該当するQAが見つかりません")

        qa_id = qa_id_row[0]

        # 履歴が既に存在するか確認
        cursor.execute("""
            SELECT 1 FROM history WHERE user_id = ? AND QA_id = ?
        """, (user_id, qa_id))
        if cursor.fetchone():
            return

        # 履歴を追加
        try:
            cursor.execute("""
                INSERT INTO history (time, user_id, QA_id)
                VALUES (?, ?, ?)
            """, (datetime.now(), user_id, qa_id))
            conn.commit()
        except sqlite3.Error as e:
            raise HTTPException(status_code=500, detail="履歴追加中にデータベースエラーが発生しました")

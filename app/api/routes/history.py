from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from config import language_mapping
from database_utils import get_db_cursor, get_placeholder
from api.routes.user import current_user_info, get_current_user
from models.schemas import QuestionRequest

router = APIRouter()

@router.get("/get_posted_question")
def get_posted_question(language_id: int, current_user: dict = Depends(current_user_info)):
    user_id = current_user["id"]
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)

    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        # クエリ実行
        cursor.execute(
            f"""
                SELECT 
                    q.question_id, 
                    q.public,
                    qt.texts AS question_text, 
                    q.time,
                    q.category_id,
                    qa.answer_id, 
                    at.texts AS answer_text
                FROM question AS q
                JOIN question_translation AS qt ON q.question_id = qt.question_id
                JOIN QA AS qa ON q.question_id = qa.question_id
                JOIN answer_translation AS at ON qa.answer_id = at.answer_id
                WHERE q.user_id = {ph}
                AND qt.language_id = {ph}
                AND at.language_id = {ph}
                ORDER BY q.time DESC
            """, (user_id, language_id, language_id)
        )

        results = cursor.fetchall()

        # データ構造を整理
        viewed_questions = {}
        for row in results:
            question_id = row['question_id']
            public_status = row['public']
            question_text = row['question_text']
            time = row['time']
            category_id = row['category_id']
            answer_id = row['answer_id']
            answer_text = row['answer_text']

            if question_id not in viewed_questions:
                viewed_questions[question_id] = {
                    "question_id": question_id,
                    "質問": question_text,
                    "time": time,
                    "public": public_status,
                    "category_id": category_id,
                    "answers": {}
                }
            # 回答を answer_id をキーにしてユニークにする
            if answer_id not in viewed_questions[question_id]["answers"]:
                viewed_questions[question_id]["answers"][answer_id] = {
                    "answer_id": answer_id,
                    "回答": answer_text
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

    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        # クエリ実行
        cursor.execute(
            f"""
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
                WHERE history.user_id = {ph}
                AND question_translation.language_id = {ph}
                AND answer_translation.language_id = {ph}
                ORDER BY history.time DESC
            """, (user_id, language_id, language_id)
        )
        results = cursor.fetchall()

        # データ構造を整理
        viewed_questions = {}
        for row in results:

            question_id = row['question_id']
            question_text = row['question_text']
            time = row['time']
            title = row['title']
            answer_id = row['answer_id']
            answer_text = row['answer_text']
            category_id = row['category_id']
            
            if question_id not in viewed_questions:
                viewed_questions[question_id] = {
                    "question_id": question_id,
                    "質問": question_text,
                    "time": time,
                    "title": title,
                    "category_id": category_id,
                    "answers": {}
                }
            # 回答を answer_id をキーにしてユニークにする
            if answer_id not in viewed_questions[question_id]["answers"]:
                viewed_questions[question_id]["answers"][answer_id] = {
                    "answer_id": answer_id,
                    "回答": answer_text
                }

        # answers をリストに変換
        for question in viewed_questions.values():
            question["answers"] = list(question["answers"].values())

        return list(viewed_questions.values())

@router.delete("/clear_history")
def clear_history(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(
            f"DELETE FROM history WHERE user_id = {ph}",
            (user_id,)
        )
        conn.commit()
    
    return {"message": "閲覧履歴が削除されました"}

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
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        # QA.idを取得
        cursor.execute(f"""
            SELECT QA.id FROM QA 
            JOIN answer ON QA.answer_id = answer.id
            WHERE question_id = {ph}
            ORDER BY answer.time DESC
        """, (question_id,))
        qa_id_row = cursor.fetchone()

        if not qa_id_row:
            raise HTTPException(status_code=404, detail="該当するQAが見つかりません")

        qa_id = qa_id_row['id']

        # 履歴が既に存在するか確認
        cursor.execute(f"""
            SELECT 1 FROM history WHERE user_id = {ph} AND QA_id = {ph}
        """, (user_id, qa_id))
        if cursor.fetchone():
            return

        # 履歴を追加
        try:
            cursor.execute(f"""
                INSERT INTO history (time, user_id, QA_id)
                VALUES ({ph}, {ph}, {ph})
            """, (datetime.now(), user_id, qa_id))
            conn.commit()
        except Exception as e:
            raise HTTPException(status_code=500, detail="履歴追加中にデータベースエラーが発生しました")

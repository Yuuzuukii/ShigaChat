from fastapi import APIRouter, HTTPException, Depends, Query
import sqlite3
import openai  as oepnai
import numpy as np
from typing import Tuple
from sklearn.metrics.pairwise import cosine_similarity
from config import DATABASE, language_mapping
from api.routes.user import current_user_info

router = APIRouter()

@router.get("/category_translation/{category_id}")
def get_translated_category(
    category_id: int,
    current_user: dict = Depends(current_user_info)
):
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # カテゴリ名を取得
        cursor.execute("""
            SELECT description 
            FROM category_translation 
            WHERE category_id = ? AND
            language_id = ?
        """, (category_id,language_id))
        category_name = cursor.fetchone()

        return{
            "カテゴリ名": category_name
        }


@router.get("/category/{category_id}")
def get_category_questions(
    category_id: int,
    current_user: dict = Depends(current_user_info)
):
    """
    指定されたカテゴリIDに基づいて質問と回答を取得します。
    ユーザーのspoken_languageを基に言語を動的に切り替えます。
    """
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)
    
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # カテゴリ名を取得
        cursor.execute("SELECT description FROM category WHERE id = ?", (category_id,))
        category_row = cursor.fetchone()
        if not category_row:
            raise HTTPException(status_code=404, detail="カテゴリが見つかりませんでした。")
        category_name = category_row[0]

        # 質問と回答を取得
        cursor.execute(
            """
            SELECT 
                question.question_id AS question_id,
                QA.answer_id,
                question_translation.texts AS question_text,
                answer_translation.texts AS answer_text,
                question.title AS question_title,
                question.time AS time
            FROM QA
            JOIN question ON QA.question_id = question.question_id
            JOIN answer ON QA.answer_id = answer.id
            JOIN question_translation ON question.question_id = question_translation.question_id
            JOIN answer_translation ON answer.id = answer_translation.answer_id
            WHERE question.category_id = ? AND 
            question_translation.language_id = ? AND 
            answer_translation.language_id = ? AND
            question.public = ?
            """,
            (category_id, language_id, language_id, 1)
        )
        qa_list = cursor.fetchall()

        if not qa_list:
            raise HTTPException(status_code=404, detail="該当する質問と回答が見つかりませんでした。")

        # 質問と回答を整形して返す
        results = [
            {
                "question_id": qa[0],  # 質問IDを追加
                "answer_id": qa[1],
                "質問": qa[2],         # 質問テキスト
                "回答": qa[3],         # 回答テキスト
                "title": qa[4],         # 質問タイトル
                "time": qa[5]
            }
            for qa in qa_list
        ]

    return {
        "category_name": category_name,
        "questions": results
    }

@router.get("/category_admin/{category_id}")
def get_category_questions_admin(
    category_id: int,
    current_user: dict = Depends(current_user_info)
):
    """
    指定されたカテゴリIDに基づいて質問と回答を取得します。
    ユーザーのspoken_languageを基に言語を動的に切り替えます。
    """
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)
    
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # カテゴリ名を取得
        cursor.execute("SELECT description FROM category WHERE id = ?", (category_id,))
        category_row = cursor.fetchone()
        if not category_row:
            raise HTTPException(status_code=404, detail="カテゴリが見つかりませんでした。")
        category_name = category_row[0]

        # 質問と回答を取得
        cursor.execute(
            """
            SELECT 
                question.question_id AS question_id,
                QA.answer_id,
                question_translation.texts AS question_text,
                answer_translation.texts AS answer_text,
                question.title AS question_title,
                question.public AS public,
                question.category_id AS category_id,
                question.time AS time,
                user.name AS user_name  -- 質問者の名前を取得
            FROM QA
            JOIN question ON QA.question_id = question.question_id
            JOIN answer ON QA.answer_id = answer.id
            JOIN question_translation ON question.question_id = question_translation.question_id
            JOIN answer_translation ON answer.id = answer_translation.answer_id
            JOIN user ON question.user_id = user.id  -- 質問者の情報を結合
            WHERE question.category_id = ? AND 
            question_translation.language_id = ? AND 
            answer_translation.language_id = ? 
            """,
            (category_id, language_id, language_id,)
        )
        qa_list = cursor.fetchall()

        if not qa_list:
            raise HTTPException(status_code=404, detail="該当する質問と回答が見つかりませんでした。")

        # 質問と回答を整形して返す
        results = [
            {
                "question_id": qa[0],  # 質問IDを追加
                "answer_id": qa[1],
                "質問": qa[2],         # 質問テキスト
                "回答": qa[3],         # 回答テキスト
                "title": qa[4],         # 質問タイトル
                "public": qa[5],        # 公開状態
                "category_id": qa[6],
                "time": qa[7],
                "user_name": qa[8]      # 質問者の名前を追加
            }
            for qa in qa_list
        ]

    return {
        "category_name": category_name,
        "questions": results
    }

@router.get("/get_category_by_question")
def get_category_by_question(question_id: int = Query(..., description="質問ID")):
    """
    `question_id` をクエリパラメータとして受け取り、対応する `category_id` を取得する API
    """
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    cursor.execute("SELECT category_id FROM question WHERE question_id = ?", (question_id,))
    category = cursor.fetchone()
    conn.close()

    if not category:
        raise HTTPException(status_code=404, detail="質問が見つかりません")

    return {"category_id": category[0]}  # tuple の最初の値を返す

@router.post("/categorize_question")
def categorize_question(question: str, language_id: int) -> Tuple[int, str]:
    """
    質問をカテゴリに分ける関数
    - ユーザーの `spoken_language` に基づいて適切な `language_id` を選択
    - `question_translation` テーブルから、該当する `language_id` の質問データを利用
    - 最も適切なカテゴリを **1つだけ** 返す
    """
    
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # ✅ カテゴリリストを取得（IDと説明文）
        cursor.execute("SELECT id, description FROM category")
        categories = cursor.fetchall()

        if not categories:
            raise HTTPException(status_code=500, detail="カテゴリ情報がデータベースにありません")

        # ✅ `question_translation` から `language_id` が一致する質問を取得
        cursor.execute("""
            SELECT q.question_id, qt.texts, q.category_id
            FROM question_translation qt
            JOIN question q ON qt.question_id = q.question_id
            WHERE qt.language_id = ?
            ORDER BY q.question_id DESC
            LIMIT 500
        """, (language_id,))
        past_questions = cursor.fetchall()  # (question_id, text, category_id)

    # ✅ 埋め込みを取得するデータを準備
    category_descriptions = [desc for _, desc in categories]
    question_texts = [text for _, text, _ in past_questions]

    try:
        # OpenAI API に送るテキスト
        input_texts = [question] + category_descriptions + question_texts
        response = oepnai.embeddings.create(input=input_texts, model="text-embedding-3-small")
        embeddings = response["data"]
        
        # ✅ 質問の埋め込み
        question_embedding = np.array(embeddings[0]["embedding"])

        # ✅ カテゴリの埋め込み
        category_embeddings = np.array([emb["embedding"] for emb in embeddings[1:len(categories) + 1]])

        # ✅ 過去の質問の埋め込み
        past_question_embeddings = np.array([emb["embedding"] for emb in embeddings[len(categories) + 1:]])

        # ✅ カテゴリと質問の類似度を計算
        category_similarities = cosine_similarity([question_embedding], category_embeddings)[0]
        
        # ✅ 過去の質問と質問の類似度を計算
        past_question_similarities = cosine_similarity([question_embedding], past_question_embeddings)[0]

        # ✅ 過去の質問のカテゴリをマッピング
        past_question_categories = [category_id for _, _, category_id in past_questions]

        # ✅ k-NN（最も類似する過去の質問を k=5 個取得）
        k = 5
        knn_indices = np.argsort(past_question_similarities)[-k:]  # 上位k個のインデックス
        knn_category_ids = [past_question_categories[i] for i in knn_indices]

        # ✅ 過去の質問カテゴリの投票
        from collections import Counter
        category_votes = Counter(knn_category_ids)
        
        # ✅ カテゴリスコアを統合
        category_scores = {}
        for (cat_id, _), sim in zip(categories, category_similarities):
            category_scores[cat_id] = sim

        for cat_id, count in category_votes.items():
            if cat_id in category_scores:
                category_scores[cat_id] += count * 0.1  # k-NN の投票を加味

        # ✅ 最もスコアが高いカテゴリを選択
        best_category_id = max(category_scores, key=category_scores.get)
        best_category_name = next(name for cid, name in categories if cid == best_category_id)

        # ✅ 類似度が 0.6 未満なら「不明」とする（しきい値設定）
        if category_scores[best_category_id] < 0.6:
            raise HTTPException(status_code=400, detail="適切なカテゴリを特定できません")

        return best_category_id, best_category_name

    except Exception as e:
        raise RuntimeError(f"OpenAI APIのエラー: {str(e)}")
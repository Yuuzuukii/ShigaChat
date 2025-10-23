from fastapi import APIRouter, HTTPException, Depends
from database_utils import get_db_cursor, get_placeholder
from api.routes.user import current_user_info

router = APIRouter()

@router.get("/search_with_language")
async def search_keywords(keywords: str, current_user: dict = Depends(current_user_info)):
    
    results = []
    keyword_list = []

    # ユーザーのspoken_languageを取得
    spoken_language = current_user["spoken_language"]
    print(f"spoken_language: {spoken_language}")  # デバッグ用ログ

    # spoken_languageからlanguage_idを取得
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(f"SELECT id FROM language WHERE name = {ph}", (spoken_language,))
        language_row = cursor.fetchone()
        if not language_row:
            print(f"Invalid spoken_language: {spoken_language}")  # 詳細なログ
            raise HTTPException(status_code=400, detail=f"Invalid spoken_language: {spoken_language}")

        language_id = language_row['id']

    # キーワードを分割
    tmp_keyword_list = keywords.split(" ")
    for keyword in tmp_keyword_list:
        keyword_list.extend(keyword.split("　"))

    # キーワードの言語で検索を実行
    for keyword in keyword_list:
        results.extend(search_keyword(keyword, language_id))

    # 検出された文を処理する
    if results:
        for result in results:
            combined_text = result["question_text"] + result["answer_text"]
            match_count = sum(keyword in combined_text for keyword in keyword_list)
            result["match_count"] = match_count
            for keyword in keyword_list:
                result["question_text"] = result["question_text"].replace(keyword, f"<strong>{keyword}</strong>")
                result["answer_text"] = result["answer_text"].replace(keyword, f"<strong>{keyword}</strong>")
        sorted_results = sorted(results, key=lambda x: x["match_count"], reverse=True)

        # 重複する結果を削除
        unique_results = []
        seen = set()
        for result in sorted_results:
            key = (result["question_id"], result["answer_id"])
            if key not in seen:
                unique_results.append(result)
                seen.add(key)
        sorted_results = unique_results

    else:
        sorted_results = []

    return sorted_results

def search_keyword(keyword: str, language_id: int):
    """
    キーワードと言語IDを基にQA情報を検索する。
    """
    keyword = f"%{keyword}%"
    results = []
    
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(f"""
            SELECT QA.question_id, 
                   question_translation.texts AS question_text, 
                   QA.answer_id, 
                   answer_translation.texts AS answer_text,
                   answer.time, 
                   category.id AS category_id, 
                   category.description AS category_description, 
                   question.title
            FROM QA
            JOIN answer ON QA.answer_id = answer.id
            JOIN answer_translation ON QA.answer_id = answer_translation.answer_id AND answer_translation.language_id = {ph}
            JOIN question_translation ON QA.question_id = question_translation.question_id AND question_translation.language_id = {ph}
            JOIN question ON QA.question_id = question.question_id
            JOIN category ON question.category_id = category.id
            WHERE question_translation.texts LIKE {ph} OR answer_translation.texts LIKE {ph}
        """, (language_id, language_id, keyword, keyword))
        search_results = cursor.fetchall()
        
        if search_results:
            for search_result in search_results:
                results.append({
                    "category_id": search_result['category_id'],
                    "category_text": search_result['category_description'],
                    "question_id": search_result['question_id'],
                    "question_text": search_result['question_text'],
                    "answer_id": search_result['answer_id'],
                    "answer_text": search_result['answer_text'],
                    "language_id": language_id,
                    "update_time": search_result['time'],
                    "title": search_result['title']
                })
            
    return results

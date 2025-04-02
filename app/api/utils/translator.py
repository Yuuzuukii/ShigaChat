import sqlite3
from deep_translator import GoogleTranslator
from fastapi import HTTPException, Depends
from api.routes.user import get_current_user
from config import DATABASE

def translate(text, source_language, target_language):
    """
    Translate text using deep-translator (Google Translator).

    Args:
        text (str): The text to be translated.
        source_language (str): The source language code (e.g., "en" or "auto").
        target_language (str): The target language code (default is "ja" for Japanese).

    Returns:
        str: Translated text.
    """
    try:
        translated = GoogleTranslator(source=source_language, target=target_language).translate(text)
        return translated
    except Exception as e:
        return f"Translation failed: {str(e)}"

def question_translate(
    question_id: int, 
    target_language_id: int, 
    current_user: dict = Depends(get_current_user)
):

    # 言語コードのマッピング
    translation_language_map = {
        "ja": "ja",       # 日本語
        "en": "en",       # 英語
        "vi": "vi",       # ベトナム語
        "zh": "zh-CN",    # 簡体字
        "ko": "ko",       # 韓国語
    }

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # 元の質問を取得
        cursor.execute("SELECT content, language_id FROM question WHERE question_id = ?", (question_id,))
        question = cursor.fetchone()
        if not question:
            raise HTTPException(status_code=404, detail="指定された質問が存在しません")

        original_content, original_language_id = question

        # 元言語コードを取得
        cursor.execute("SELECT code FROM language WHERE id = ?", (original_language_id,))
        source_language_row = cursor.fetchone()
        if not source_language_row:
            raise HTTPException(status_code=404, detail="元言語コードが見つかりません")
        source_language_code = source_language_row[0].lower()  # 小文字に変換

        # ターゲット言語コードを取得
        cursor.execute("SELECT code FROM language WHERE id = ?", (target_language_id,))
        target_language_row = cursor.fetchone()
        if not target_language_row:
            raise HTTPException(status_code=404, detail="指定された言語IDが存在しません")
        target_language_code_from_db = target_language_row[0].lower()  # 小文字に変換

        # 言語マッピングから翻訳ライブラリ用のコードを取得
        source_language_code_mapped = translation_language_map.get(source_language_code)
        target_language_code = translation_language_map.get(target_language_code_from_db)

        if not source_language_code_mapped:
            raise HTTPException(status_code=400, detail=f"元言語 {source_language_code} はサポートされていません")
        if not target_language_code:
            raise HTTPException(status_code=400, detail=f"ターゲット言語 {target_language_code_from_db} はサポートされていません")

        # 元言語とターゲット言語が同じ場合は処理をスキップ
        if original_language_id == target_language_id:
            return {"message": "元の言語とターゲット言語が同じです。翻訳は不要です。"}

        # 翻訳処理
        try:
            translated_text = translate(original_content, source_language_code_mapped, target_language_code)
            cursor.execute("""
                INSERT OR REPLACE INTO question_translation (question_id, language_id, texts)
                VALUES (?, ?, ?)
            """, (question_id, target_language_id, translated_text))
            conn.commit()

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"翻訳に失敗しました: {e}")

    return {"message": f"質問ID {question_id} の翻訳が言語ID {target_language_id} に保存されました。"}

def answer_translate(
    answer_id: int, 
    target_language_id: int, 
    current_user: dict = Depends(get_current_user)
):

    # 言語コードのマッピング
    translation_language_map = {
        "ja": "ja",       # 日本語
        "en": "en",       # 英語
        "vi": "vi",       # ベトナム語
        "zh": "zh-CN",    # 簡体字
        "ko": "ko",       # 韓国語
    }

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # 元の回答を取得
        cursor.execute("SELECT texts, language_id FROM answer_translation WHERE answer_id = ?", (answer_id,))
        answer = cursor.fetchone()
        if not answer:
            raise HTTPException(status_code=404, detail="指定された回答が存在しません")

        original_content, original_language_id = answer

        # 元言語コードを取得
        cursor.execute("SELECT code FROM language WHERE id = ?", (original_language_id,))
        source_language_row = cursor.fetchone()
        if not source_language_row:
            raise HTTPException(status_code=404, detail="元言語コードが見つかりません")
        source_language_code = source_language_row[0].lower()  # 小文字に変換

        # ターゲット言語コードを取得
        cursor.execute("SELECT code FROM language WHERE id = ?", (target_language_id,))
        target_language_row = cursor.fetchone()
        if not target_language_row:
            raise HTTPException(status_code=404, detail="指定された言語IDが存在しません")
        target_language_code_from_db = target_language_row[0].lower()  # 小文字に変換

        # 言語マッピングから翻訳ライブラリ用のコードを取得
        source_language_code_mapped = translation_language_map.get(source_language_code)
        target_language_code = translation_language_map.get(target_language_code_from_db)

        if not source_language_code_mapped:
            raise HTTPException(status_code=400, detail=f"元言語 {source_language_code} はサポートされていません")
        if not target_language_code:
            raise HTTPException(status_code=400, detail=f"ターゲット言語 {target_language_code_from_db} はサポートされていません")

        # 元言語とターゲット言語が同じ場合は処理をスキップ
        if original_language_id == target_language_id:
            return {"message": "元の言語とターゲット言語が同じです。翻訳は不要です。"}

        # 翻訳処理
        try:
            translated_text = translate(original_content, source_language_code_mapped, target_language_code)
            cursor.execute("""
                INSERT INTO answer_translation (answer_id, language_id, texts)
                VALUES (?, ?, ?)
            """, (answer_id, target_language_id, translated_text))
            conn.commit()

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"翻訳に失敗しました: {e}")

    return {"message": f"回答ID {answer_id} の翻訳が言語ID {target_language_id} に保存されました。"}

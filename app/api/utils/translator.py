import sqlite3
from deep_translator import GoogleTranslator
from fastapi import HTTPException, Depends
from api.routes.user import get_current_user
from config import DATABASE

from deep_translator import GoogleTranslator


import re

# [ラベル](URL) を優先的に検出（URLは翻訳禁止、ラベルは翻訳OK）
_MD_LINK_RE = re.compile(r'\[([^\]]+)\]\((https?://[^\s)]+)\)')
# 裸URL（Markdown外）を検出
_BARE_URL_RE = re.compile(r'(https?://[^\s<>()\[\]"]+)')

def _freeze_urls(text: str):
    """
    テキスト中のURLをプレースホルダへ一時退避。
    - Markdownリンク: [テキスト](URL) → [テキスト](__URLTOKEN_0__)
    - 裸URL: https://...          → __URLTOKEN_1__
    戻り値: (置換後テキスト, {トークン: 元URL})
    """
    url_map = {}
    token_id = 0

    def _md_sub(m):
        nonlocal token_id
        label, url = m.group(1), m.group(2)
        tok = f"{_TOKEN_PREFIX}{token_id}{_TOKEN_SUFFIX}"
        url_map[tok] = url
        token_id += 1
        return f"[{label}]({tok})"

    # 1) 先に Markdown の URL を退避
    text = _MD_LINK_RE.sub(_md_sub, text)

    # 2) 残る裸URLを退避
    def _bare_sub(m):
        nonlocal token_id
        url = m.group(1)
        tok = f"{_TOKEN_PREFIX}{token_id}{_TOKEN_SUFFIX}"
        url_map[tok] = url
        token_id += 1
        return tok

    text = _BARE_URL_RE.sub(_bare_sub, text)
    return text, url_map


import re

_TOKEN_PREFIX = "__URLTOKEN_"
_TOKEN_SUFFIX = "__"

def _thaw_urls(text: str, url_map: dict) -> str:
    # 1) まず厳密一致
    for tok, url in url_map.items():
        text = text.replace(tok, url)

    # 2) ゆるい一致（ケース無視・空白/ハイフン/下線混在許容）
    for tok, url in url_map.items():
        # tok 例: "__URLTOKEN_12__" → 数字部分を取り出す
        num = re.escape(tok[len(_TOKEN_PREFIX):-len(_TOKEN_SUFFIX)])

        # "__Urltoken_12__" / "__URL TOKEN - 12 __" などを許容
        #   - "__" + (URLTOKEN の大小/空白混在) + "_" or "-" + 数字 + "__"
        loose_pat = re.compile(
            r'__\s*u\s*r\s*l\s*t\s*o\s*k\s*e\s*n\s*[-_]\s*' + num + r'\s*__',
            flags=re.I
        )
        text = loose_pat.sub(url, text)

    return text


MAX_CHARS_PER_REQUEST = 1000  # safety margin under practical limits


def _split_safe_for_tokens(text: str, max_len: int) -> list:
    """Split text into <= max_len chunks, avoiding cutting URL tokens.

    Heuristic:
    - Primary cut at max_len
    - If the cut falls inside a token like __URLTOKEN_12__, backtrack to a
      nearby safe boundary (space/newline/)/]) before the token start.
    """
    chunks = []
    n = len(text)
    pos = 0
    while pos < n:
        end = min(pos + max_len, n)
        chunk = text[pos:end]

        # Avoid cutting inside token
        last_tok_pos = chunk.rfind(_TOKEN_PREFIX)
        if last_tok_pos != -1:
            # Ensure token suffix exists after the last token start within chunk
            suffix_in_chunk = _TOKEN_SUFFIX in chunk[last_tok_pos + len(_TOKEN_PREFIX) :]
            if not suffix_in_chunk:
                # Backtrack to a safe boundary before token start
                safe_candidates = [
                    chunk.rfind("\n", 0, last_tok_pos),
                    chunk.rfind(" ", 0, last_tok_pos),
                    chunk.rfind(")", 0, last_tok_pos),
                    chunk.rfind("]", 0, last_tok_pos),
                ]
                safe = max(safe_candidates)
                if safe == -1:
                    # As a last resort, cut exactly before the token start
                    end = pos + last_tok_pos
                else:
                    end = pos + safe + 1
                chunk = text[pos:end]

        chunks.append(chunk)
        pos = end

    return chunks


def translate(text, source_language, target_language):
    """
    deep-translator (GoogleTranslator) で翻訳。
    翻訳前に URL（#フラグメント含む）をトークン化 → 翻訳後に復元。
    """
    try:
        # URLを一時退避
        frozen_text, url_map = _freeze_urls(text or "")

        translator = GoogleTranslator(source=source_language, target=target_language)

        # 長文は分割して逐次翻訳
        if len(frozen_text) <= MAX_CHARS_PER_REQUEST:
            translated_parts = [translator.translate(frozen_text)]
        else:
            parts = _split_safe_for_tokens(frozen_text, MAX_CHARS_PER_REQUEST)
            # deep_translator may support translate_batch, fall back if not
            if hasattr(translator, "translate_batch"):
                translated_parts = translator.translate_batch(parts)
            else:
                translated_parts = [translator.translate(p) for p in parts]
        translated = "".join(translated_parts)

        # URLを元に戻す
        restored = _thaw_urls(translated, url_map)
        return restored
    except Exception as e:
        # ここで "Translation failed: ..." を返すとDBに混入するので例外を投げる
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")


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

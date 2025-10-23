from datetime import datetime,timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from api.routes.user import current_user_info
from api.utils.translator import question_translate, answer_translate
from config import language_mapping
from database_utils import get_db_cursor, get_placeholder
from api.utils.translator import translate
from models.schemas import QuestionRequest, moveCategoryRequest, RegisterQuestionRequest
from api.utils.RAG import append_qa_to_vector_index, append_qa_to_vector_index_for_languages, add_qa_id_to_ignore, ignore_current_vectors_for_qa_languages

router = APIRouter()

# ----- Answer history helpers -------------------------------------------------
def _register_question_background(
    question_id: int,
    answer_id: int,
    base_language_id: int,
    user_id: int,
    content: str,
    answer_text: str,
    spoken_language_label: str,
):
    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            # 全言語
            cursor.execute("SELECT id FROM language")
            languages = [r['id'] for r in cursor.fetchall()]

            # 翻訳（質問）
            for target_lang_id in languages:
                if int(target_lang_id) == int(base_language_id):
                    continue
                try:
                    question_translate(question_id, target_lang_id, {"id": user_id, "spoken_language": spoken_language_label})
                except Exception:
                    pass

            # 翻訳（回答）
            for target_lang_id in languages:
                if int(target_lang_id) == int(base_language_id):
                    continue
                try:
                    answer_translate(answer_id, target_lang_id, {"id": user_id, "spoken_language": spoken_language_label})
                except Exception:
                    pass

            # 通知（全体）
            try:
                snippet_length = 50
                _ensure_system_user()
                _ensure_notifications_question_id()
                try:
                    cursor.execute(
                        f"INSERT INTO notifications (user_id, is_read, time, global_read_users, question_id) VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                        (-1, False, datetime.now(), '[]', question_id),
                    )
                except Exception:
                    cursor.execute(
                        f"INSERT INTO notifications (user_id, is_read, time, global_read_users, question_id) VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                        (user_id, False, datetime.now(), '[]', question_id),
                    )
                notification_id = cursor.lastrowid
                conn.commit()

                cursor.execute(f"SELECT language_id, texts FROM question_translation WHERE question_id = {ph}", (question_id,))
                translations = cursor.fetchall() or []

                # 言語別メッセージ
                new_question_translations = {
                    "日本語": "新しい質問が登録されました",
                    "English": "A new question has been registered",
                    "中文": "已注册新问题",
                    "한국어": "새 질문이 등록되었습니다",
                    "Português": "Uma nova pergunta foi registrada",
                    "Español": "Se ha registrado una nueva pregunta",
                    "Tiếng Việt": "Câu hỏi mới đã được đăng ký",
                    "Tagalog": "Nairehistro ang bagong tanong",
                    "Bahasa Indonesia": "Pertanyaan baru telah didaftarkan",
                }
                by_user_translations = {
                    "日本語": "登録者",
                    "English": "by",
                    "中文": "由",
                    "한국어": "등록자",
                    "Português": "por",
                    "Español": "por",
                    "Tiếng Việt": "bởi",
                    "Tagalog": "ni",
                    "Bahasa Indonesia": "oleh",
                }
                nickname = None
                try:
                    cursor.execute(f"SELECT name FROM user WHERE id = {ph}", (user_id,))
                    r = cursor.fetchone()
                    nickname = (r and (r.get('name') if isinstance(r, dict) else r[0])) or "user"
                except Exception:
                    nickname = "user"

                for row in translations:
                    lang_id = row['language_id'] if isinstance(row, dict) else row[0]
                    text = row['texts'] if isinstance(row, dict) else row[1]
                    snippet = text[:snippet_length] + ("..." if len(text) > snippet_length else "")
                    lang_name = None
                    for k, v in language_mapping.items():
                        if v == lang_id:
                            lang_name = k
                            break
                    if not lang_name:
                        lang_name = "English"
                    prefix = new_question_translations.get(lang_name, "A new question has been registered")
                    by_label = by_user_translations.get(lang_name, "by")
                    translated_message = f"{prefix}（{by_label}: {nickname}）: {snippet}"
                    cursor.execute(
                        f"INSERT INTO notifications_translation (notification_id, language_id, messages) VALUES ({ph}, {ph}, {ph})",
                        (notification_id, lang_id, translated_message),
                    )
                conn.commit()
            except Exception:
                pass

        # ベクトル
        try:
            append_qa_to_vector_index(question_id, answer_id)
        except Exception:
            pass
    except Exception:
        pass
def _ensure_system_user() -> None:
    """Ensure a special system user with id = -1 exists for global notifications.
    Some code uses user_id = -1 to mark global notifications; satisfy FK.
    """
    try:
        ph = get_placeholder()
        with get_db_cursor() as (cur, conn):
            cur.execute(f"SELECT id FROM user WHERE id = {ph}", (-1,))
            row = cur.fetchone()
            if not row:
                try:
                    # Insert minimal row. Adjust columns as per existing schema.
                    cur.execute(
                        f"INSERT INTO user (id, name, password, spoken_language) VALUES ({ph}, {ph}, {ph}, {ph})",
                        (-1, "__system__", "", "English"),
                    )
                    conn.commit()
                except Exception:
                    # If insertion fails (e.g., different schema), skip; caller may handle differently.
                    pass
    except Exception:
        pass
def _ensure_answer_translation_history() -> None:
    try:
        with get_db_cursor() as (cur, conn):
            cur.execute("""
                    CREATE TABLE IF NOT EXISTS answer_translation_history (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        answer_id INT NOT NULL,
                        language_id INT NOT NULL,
                        texts TEXT NOT NULL,
                        edited_at DATETIME NOT NULL,
                        editor_user_id INT,
                        editor_name TEXT,
                        INDEX idx_ath_answer_lang (answer_id, language_id)
                    )
                """)
            conn.commit()
    except Exception:
        pass

def _ensure_question_grammar_check_table():
    try:
        with get_db_cursor() as (cur, conn):
            cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS question_grammar_check (
                        question_id INT NOT NULL,
                        language_id INT NOT NULL,
                        grammar_check_enabled BOOLEAN DEFAULT FALSE,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        PRIMARY KEY (question_id, language_id),
                        FOREIGN KEY (question_id) REFERENCES question (question_id),
                        FOREIGN KEY (language_id) REFERENCES language (id)
                    )
                    """
                )
            conn.commit()
    except Exception:
        pass

def _ensure_notifications_question_id():
    try:
        with get_db_cursor() as (cur, conn):
                cur.execute("""
                    SELECT COUNT(*) FROM information_schema.COLUMNS 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = 'notifications' 
                    AND COLUMN_NAME = 'question_id'
                """)
                row = cur.fetchone()
                cnt = row['COUNT(*)'] if isinstance(row, dict) and 'COUNT(*)' in row else (list(row.values())[0] if isinstance(row, dict) else row[0])
                if cnt == 0:
                    cur.execute("ALTER TABLE notifications ADD COLUMN question_id INT")
                    conn.commit()
    except Exception:
        pass

def _ensure_question_editor_columns():
    try:
        with get_db_cursor() as (cur, conn):
                cur.execute("""
                    SELECT COUNT(*) FROM information_schema.COLUMNS 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = 'question' 
                    AND COLUMN_NAME IN ('last_editor_id', 'last_edited_at')
                """)
                row = cur.fetchone()
                existing_cols = row['COUNT(*)'] if isinstance(row, dict) and 'COUNT(*)' in row else (list(row.values())[0] if isinstance(row, dict) else row[0])
                if existing_cols < 2:
                    cur.execute("""
                        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                        WHERE TABLE_SCHEMA = DATABASE() 
                        AND TABLE_NAME = 'question' 
                        AND COLUMN_NAME IN ('last_editor_id', 'last_edited_at')
                    """)
                    cols = [r['COLUMN_NAME'] for r in cur.fetchall()]
                    if "last_editor_id" not in cols:
                        cur.execute("ALTER TABLE question ADD COLUMN last_editor_id INT")
                    if "last_edited_at" not in cols:
                        cur.execute("ALTER TABLE question ADD COLUMN last_edited_at DATETIME")
                    conn.commit()
    except Exception:
        pass

@router.post("/answer_edit")
async def answer_edit(request: dict, background_tasks: BackgroundTasks, current_user: dict = Depends(current_user_info)):
    """ 回答を編集し、翻訳データを更新 + 通知を作成 """
    operator_id = current_user["id"]
    if operator_id is None:
        raise HTTPException(status_code=400, detail="認証情報が取得できません")

    spoken_language = current_user.get("spoken_language")
    language_id = language_mapping.get(spoken_language)
    answer_id = request.get("answer_id")
    translate_to_all = request.get("translate_to_all", False)  # デフォルトはFalse
    
    print(f"🔍 answer_edit called: answer_id={answer_id}, translate_to_all={translate_to_all}, language_id={language_id}")

    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):

            # 🔍 `QA` テーブルから `question_id` を取得
            cursor.execute(f"SELECT question_id FROM QA WHERE answer_id = {ph}", (answer_id,))
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"回答 {answer_id} に対応する質問が見つかりません")

            question_id = row['question_id']

            # 🔍 `question` テーブルから 投稿者 と 直近編集者 を取得
            _ensure_question_editor_columns()
            cursor.execute(f"SELECT user_id, COALESCE(last_editor_id, user_id) FROM question WHERE question_id = {ph}", (question_id,))
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} の投稿者が見つかりません")
            question_owner_id = row['user_id']
            prev_editor_id = row['COALESCE(last_editor_id, user_id)']

            # ベクトルの無効化は言語確定後に実行

            # 🔄 `answer_translation` テーブルを更新（履歴保存付き）
            _ensure_answer_translation_history()

            # まず、編集対象言語の現行テキストを履歴へ保存（差分があるときのみ）
            try:
                cursor.execute(
                    f"SELECT texts FROM answer_translation WHERE answer_id = {ph} AND language_id = {ph}",
                    (answer_id, language_id),
                )
                row_cur = cursor.fetchone()
                row_cur_text = row_cur['texts'] if (row_cur and isinstance(row_cur, dict)) else (row_cur[0] if row_cur else None)
                if row_cur_text and row_cur_text != request.get("new_text"):
                    cursor.execute(
                        f"""
                        INSERT INTO answer_translation_history (answer_id, language_id, texts, edited_at, editor_user_id, editor_name)
                        VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                        """,
                        (
                            answer_id,
                            language_id,
                            row_cur_text,
                            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            operator_id,
                            current_user.get("name", "user"),
                        ),
                    )
            except Exception:
                pass

            # 対象言語の現行テキストを更新
            cursor.execute(f"""
                UPDATE answer_translation
                SET texts = {ph}
                WHERE answer_id = {ph} AND language_id = {ph}
            """, (request.get("new_text"), answer_id, language_id))

            # 回答本体の更新時刻を更新（最終編集日時として利用）
            try:
                cursor.execute(
                    f"UPDATE answer SET time = {ph} WHERE id = {ph}",
                    (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), answer_id),
                )
            except Exception:
                pass

            # 言語ラベルからコードへのマッピング（ベクトル更新でも使用）
            language_label_to_code = {
                "日本語": "ja",
                "English": "en",
                "Tiếng Việt": "vi",
                "中文": "zh-CN",
                "한국어": "ko",
                "Português": "pt",
                "Español": "es",
                "Tagalog": "tl",
                "Bahasa Indonesia": "id"
            }

            # 4. 文法チェック機能
            if translate_to_all:
                # 文法チェック設定テーブルを確保
                _ensure_question_grammar_check_table()
                
                # 現在編集中の言語の文法チェックが有効かチェック
                cursor.execute(
                    f"SELECT grammar_check_enabled FROM question_grammar_check WHERE question_id = {ph} AND language_id = {ph}",
                    (question_id, language_id)
                )
                grammar_check_row = cursor.fetchone()
                
                # デフォルトは無効(レコードが存在しない場合)
                if grammar_check_row:
                    grammar_check_enabled = grammar_check_row['grammar_check_enabled'] if isinstance(grammar_check_row, dict) else grammar_check_row[0]
                else:
                    grammar_check_enabled = False
                
                if grammar_check_enabled:
                    try:
                        # 簡単な文法チェック（長すぎる文、句読点のチェックなど）
                        new_text = request.get("new_text", "")
                        grammar_suggestions = []
                        
                        # 基本的な文法チェック
                        if len(new_text) > 1000:
                            grammar_suggestions.append("文章が長すぎる可能性があります（1000文字以上）")
                        
                        if not new_text.strip().endswith(('。', '！', '？', '.', '!', '?')):
                            grammar_suggestions.append("文末に適切な句読点がありません")
                        
                        # 連続する句読点のチェック
                        import re
                        if re.search(r'[。！？.!?]{2,}', new_text):
                            grammar_suggestions.append("連続する句読点があります")
                        
                        # 文法チェック結果をログ出力（実際のプロダクションではより詳細な処理を実装）
                        if grammar_suggestions:
                            print(f"Grammar check suggestions for answer {answer_id} (language {language_id}): {grammar_suggestions}")
                        else:
                            print(f"Grammar check passed for answer {answer_id} (language {language_id})")
                            
                    except Exception as e:
                        print(f"Grammar check error for answer {answer_id} (language {language_id}): {str(e)}")
                        # 文法チェック失敗は致命的エラーとしない

                # 📌 全言語翻訳実行後は編集言語を必ず有効、他言語は無効にする
                try:
                    # 全ての言語IDを取得
                    cursor.execute("SELECT id FROM language")
                    all_languages = [r['id'] for r in cursor.fetchall()]
                    
                    for lang_id in all_languages:
                        # 編集した言語は必ず有効、他の言語は無効（翻訳されたテキストは再度チェックが必要）
                        grammar_enabled = 1 if (lang_id == language_id) else 0
                        
                        cursor.execute(f"SELECT grammar_check_enabled FROM question_grammar_check WHERE question_id = {ph} AND language_id = {ph}", (question_id, lang_id))
                        exists = cursor.fetchone()
                        
                        if exists:
                            # 既存設定を更新
                            cursor.execute(
                                f"UPDATE question_grammar_check SET grammar_check_enabled = {ph}, updated_at = {ph} WHERE question_id = {ph} AND language_id = {ph}",
                                (grammar_enabled, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id, lang_id)
                            )
                        else:
                            # レコードが存在しない場合は新規作成
                            cursor.execute(
                                f"INSERT INTO question_grammar_check (question_id, language_id, grammar_check_enabled, created_at, updated_at) VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                                (question_id, lang_id, grammar_enabled, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                            )
                    
                    conn.commit()
                    print(f"✅ 文法チェック設定を更新: 編集言語({language_id})=有効、他言語=無効（翻訳後は各言語で再チェックが必要）")
                except Exception as e:
                    print(f"❌ 文法チェック設定の更新に失敗: {str(e)}")
                    import traceback
                    print(f"❌ スタックトレース: {traceback.format_exc()}")
                    # 設定更新の失敗は致命的エラーとしない
            else:
                # 単一言語編集時：編集中の自言語のみチェックを有効化（他言語は変更しない）
                try:
                    _ensure_question_grammar_check_table()
                    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    cursor.execute(
                        f"SELECT grammar_check_enabled FROM question_grammar_check WHERE question_id = {ph} AND language_id = {ph}",
                        (question_id, language_id)
                    )
                    exists = cursor.fetchone()
                    if exists:
                        cursor.execute(
                            f"UPDATE question_grammar_check SET grammar_check_enabled = {ph}, updated_at = {ph} WHERE question_id = {ph} AND language_id = {ph}",
                            (1, now, question_id, language_id)
                        )
                    else:
                        cursor.execute(
                            f"INSERT INTO question_grammar_check (question_id, language_id, grammar_check_enabled, created_at, updated_at) VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                            (question_id, language_id, 1, now, now)
                        )
                    conn.commit()
                except Exception as e:
                    print(f"❌ 文法チェック（単一言語）の更新に失敗: {str(e)}")
                    # 失敗しても致命的ではないため続行

            # 5. 全言語への翻訳を行うかチェック
            if translate_to_all:
                # バックグラウンドタスクで全言語翻訳を実行
                background_tasks.add_task(
                    _background_translate_all_languages,
                    answer_id,
                    question_id,
                    request.get("new_text"),
                    language_id,
                    language_label_to_code.get(spoken_language, "auto"),
                    operator_id,
                    current_user.get("name", "user"),
                    language_label_to_code
                )
                print(f"🚀 バックグラウンドで全言語翻訳を開始: answer_id={answer_id}, question_id={question_id}")

            conn.commit()

            # 🔖 最終編集者を更新（回答編集時）
            try:
                _ensure_question_editor_columns()
                cursor.execute(
                    f"UPDATE question SET last_editor_id = {ph}, last_edited_at = {ph} WHERE question_id = {ph}",
                    (operator_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id)
                )
                conn.commit()
            except Exception:
                pass

            # 変更後の内容でベクトルを差分追加（更新された言語のみ）
            # 注: translate_to_all の場合、全言語のベクトル更新はバックグラウンドで実行
            if not translate_to_all:
                try:
                    # 編集言語のみベクトル更新
                    updated_languages = [language_label_to_code.get(spoken_language, "ja")]
                    
                    # 更新対象言語の現在のベクトルを無効化
                    ignore_current_vectors_for_qa_languages(question_id, answer_id, updated_languages)
                    
                    # 新しいベクトルを追加
                    append_qa_to_vector_index_for_languages(question_id, answer_id, updated_languages)
                except Exception as e:
                    print(f"ベクトル更新エラー(編集言語のみ): {str(e)}")

            # 📢 【通知の登録】直近編集者に個人通知（自分以外）
            if prev_editor_id and operator_id != prev_editor_id:
                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id()
                cursor.execute(
                    f"INSERT INTO notifications (user_id, is_read, time, question_id) VALUES ({ph}, {ph}, {ph}, {ph})",
                    (prev_editor_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
                )
                notification_id = cursor.lastrowid  # 挿入された通知のID
                conn.commit()

                # 🔹 `notifications_translation` に翻訳を追加
                editor_name = current_user.get("name", "user")
                translations = {
                    "日本語": f"あなたの質問への回答が {editor_name} により編集されました。",
                    "English": f"The answer to your question was edited by {editor_name}.",
                    "Tiếng Việt": f"Câu trả lời cho câu hỏi của bạn đã được {editor_name} chỉnh sửa.",
                    "中文": f"您的问题的回答已被 {editor_name} 编辑。",
                    "한국어": f"귀하의 질문에 대한 답변이 {editor_name} 님에 의해 수정되었습니다.",
                    "Português": f"A resposta à sua pergunta foi editada por {editor_name}.",
                    "Español": f"La respuesta a su pregunta fue editada por {editor_name}.",
                    "Tagalog": f"Ang sagot sa iyong tanong ay inedit ni {editor_name}.",
                    "Bahasa Indonesia": f"Jawaban atas pertanyaan Anda telah diedit oleh {editor_name}."
                }

                # 各言語の翻訳を `notifications_translation` に追加
                for lang, lang_id in language_mapping.items():
                    cursor.execute(
                        f"""
                        INSERT INTO notifications_translation (notification_id, language_id, messages)
                        VALUES ({ph}, {ph}, {ph})
                        """,
                        (notification_id, lang_id, translations[lang]),
                    )

                conn.commit()  # 翻訳の挿入を確定

        return {"editor_id": operator_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

def _code_to_language_id(code: str) -> int:
    """言語コードから言語IDを取得"""
    ph = get_placeholder()
    with get_db_cursor() as (cur, conn):
        cur.execute(f"SELECT id FROM language WHERE lower(code) = {ph}", (code.lower(),))
        row = cur.fetchone()
        if row:
            return int(row['id'])
        return None

# 言語コードから言語IDへのマッピング（フロントエンドと一致）
language_code_to_id = {
    "ja": 1,
    "en": 2,
    "vi": 3,
    "zh": 4,
    "ko": 5,
    "pt": 6,
    "es": 7,
    "tl": 8,
    "id": 9,
}


@router.get("/answer_history")
async def get_answer_history(
    answer_id: int,
    lang: str = Query(None, description="Optional language code like ja/en/vi/zh/ko"),
    current_user: dict = Depends(current_user_info),
):
    """指定した回答の過去翻訳履歴を取得（ユーザーの使用言語で）。古い→新しいの時系列。"""
    spoken_language = current_user.get("spoken_language")
    language_id = None

    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            _ensure_answer_translation_history()
            # Resolve language_id: explicit 'lang' param takes precedence
            if lang:
                language_id = _code_to_language_id(lang)
            if not language_id:
                language_id = language_mapping.get(spoken_language)
            if not language_id:
                raise HTTPException(status_code=400, detail="Unsupported spoken language or lang code")
            cursor.execute(
                f"""
                SELECT texts, edited_at, editor_user_id, COALESCE(editor_name, '') as editor_name
                FROM answer_translation_history
                WHERE answer_id = {ph} AND language_id = {ph}
                ORDER BY edited_at ASC
                """,
                (answer_id, language_id),
            )
            rows = cursor.fetchall() or []
        history = [
            {
                "texts": r['texts'] if isinstance(r, dict) else r[0],
                "edited_at": r['edited_at'] if isinstance(r, dict) else r[1],
                "editor_user_id": r['editor_user_id'] if isinstance(r, dict) else r[2],
                "editor_name": r['editor_name'] if isinstance(r, dict) else r[3],
            }
            for r in rows
        ]
        return {"answer_id": answer_id, "language_id": language_id, "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")
    
@router.put("/official_question")
async def official_question(request: dict, current_user: dict = Depends(current_user_info)):
    """
    指定された question_id の title を 'official' または 'ユーザ質問' に変更 + 通知を作成
    """
    operator_id = current_user["id"]
    if operator_id is None:
        raise HTTPException(status_code=400, detail="認証情報が取得できません")

    question_id = request.get("question_id")
    new_title = request.get("title")

    if new_title not in ["official", "ユーザ質問"]:
        raise HTTPException(status_code=400, detail="Invalid title. Must be 'official' or 'ユーザ質問'.")

    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):

            # 🔍 投稿者と直近編集者を取得
            _ensure_question_editor_columns()
            cursor.execute(f"SELECT user_id, COALESCE(last_editor_id, user_id) FROM question WHERE question_id = {ph}", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} が見つかりません")

            question_owner_id = row['user_id']
            prev_editor_id = row['COALESCE(last_editor_id, user_id)']

            # 🔄 title を更新
            cursor.execute(f"UPDATE question SET title={ph} WHERE question_id={ph}", (new_title, question_id))
            conn.commit()
            # mark last editor
            try:
                _ensure_question_editor_columns()
                cursor.execute(
                    f"UPDATE question SET last_editor_id = {ph}, last_edited_at = {ph} WHERE question_id = {ph}",
                    (operator_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id)
                )
                conn.commit()
            except Exception:
                pass

            # 📢 【通知の登録】直近編集者に通知（自分以外）
            if prev_editor_id and operator_id != prev_editor_id:
                notification_message = (
                    f"あなたの質問（ID: {question_id}）が管理者により「{new_title}」に変更されました。"
                )

                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id()
                cursor.execute(
                    f"INSERT INTO notifications (user_id, is_read, time, question_id) VALUES ({ph}, {ph}, {ph}, {ph})",
                    (prev_editor_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
                )
                notification_id = cursor.lastrowid  # 挿入された通知のID
                conn.commit()

                # 🔹 `notifications_translation` に翻訳を追加
                translations = {
                    "日本語": f"あなたの質問が管理者により「{new_title}」に変更されました。（ID: {question_id}）",
                    "English": f"Your question has been changed to \"{new_title}\" by the administrator.(ID: {question_id})",
                    "Tiếng Việt": f"Câu hỏi của bạn đã được quản trị viên thay đổi thành \"{new_title}\". (ID: {question_id})",
                    "中文": f"您的问题已被管理员更改为 \"{new_title}\"。（ID: {question_id}）",
                    "한국어": f"귀하의 질문 이 관리자에 의해 \"{new_title}\"(으)로 변경되었습니다.(ID: {question_id})",
                    "Português": f"Sua pergunta foi alterada para \"{new_title}\" pelo administrador. (ID: {question_id})",
                    "Español": f"Su pregunta ha sido cambiada a \"{new_title}\" por el administrador. (ID: {question_id})",
                    "Tagalog": f"Ang iyong tanong ay binago sa \"{new_title}\" ng administrador. (ID: {question_id})",
                    "Bahasa Indonesia": f"Pertanyaan Anda telah diubah menjadi \"{new_title}\" oleh administrator. (ID: {question_id})"
                }

                # 各言語の翻訳を `notifications_translation` に追加
                for lang, lang_id in language_mapping.items():
                    cursor.execute(
                        f"""
                        INSERT INTO notifications_translation (notification_id, language_id, messages)
                        VALUES ({ph}, {ph}, {ph})
                        """,
                        (notification_id, lang_id, translations[lang]),
                    )

                conn.commit()  # 翻訳の挿入を確定

        return {"editor_user_id": operator_id, "question_id": question_id, "new_title": new_title}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")
    

@router.post("/delete_question")
async def delete_question(request: QuestionRequest, current_user: dict = Depends(current_user_info)):
    """
    指定された質問 (question_id) と関連データを削除する
    """
    question_id = request.question_id
    operator_id = current_user["id"]
    if operator_id is None:
        raise HTTPException(status_code=400, detail="認証情報が取得できません")

    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):

            # 🔍 質問の投稿者・直近編集者を取得
            _ensure_question_editor_columns()
            cursor.execute(f"SELECT user_id, COALESCE(last_editor_id, user_id) FROM question WHERE question_id = {ph}", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} が見つかりません")

            question_owner_id = row['user_id']
            prev_editor_id = row['COALESCE(last_editor_id, user_id)']

            # 🔹 `QA` から `id` と `answer_id` を取得
            cursor.execute(f"SELECT id, answer_id FROM QA WHERE question_id = {ph}", (question_id,))
            qa_row = cursor.fetchone()

            if not qa_row:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} に対応する回答が見つかりません")

            qa_id = qa_row['id']
            answer_id = qa_row['answer_id']

            # 🧹 ベクトルをグローバルに無効化（QA IDベース）
            try:
                add_qa_id_to_ignore(qa_id)
            except Exception:
                pass

            # 🔥 ベクトルインデックスから削除（QA削除前にqa_idを取得）
            try:
                cursor.execute(f"SELECT id FROM QA WHERE question_id = {ph} AND answer_id = {ph}", (question_id, answer_id))
                qa_row = cursor.fetchone()
                if qa_row:
                    qa_id = qa_row['id']
                    add_qa_id_to_ignore(qa_id)  # ベクトル検索時に無視リストに追加
            except Exception:
                pass

            # 🔹 データ削除処理（トランザクション処理を使用）
            cursor.execute(f"DELETE FROM question WHERE question_id = {ph}", (question_id,))
            cursor.execute(f"DELETE FROM question_translation WHERE question_id = {ph}", (question_id,))
            cursor.execute(f"DELETE FROM QA WHERE question_id = {ph}", (question_id,))
            cursor.execute(f"DELETE FROM answer_translation WHERE answer_id = {ph}", (answer_id,))
            cursor.execute(f"DELETE FROM answer WHERE id = {ph}", (answer_id,))

            conn.commit()  # すべての削除を確定

            # 🔥 関連する既存通知をクリーンアップ（削除通知を新規作成する前に）
            try:
                _ensure_notifications_question_id()
                cursor.execute(f"SELECT id FROM notifications WHERE question_id = {ph}", (question_id,))
                old_notifs = [r['id'] for r in cursor.fetchall()]
                if old_notifs:
                    cursor.executemany(f"DELETE FROM notifications_translation WHERE notification_id = {ph}", [(nid,) for nid in old_notifs])
                    cursor.execute(f"DELETE FROM notifications WHERE question_id = {ph}", (question_id,))
                    conn.commit()
            except Exception:
                pass

            # 📢 【通知の登録】直近編集者に通知（自分以外）
            if prev_editor_id and operator_id != prev_editor_id:
                notification_message = f"あなたの質問（ID: {question_id}）が管理者({operator_id})により削除されました。"

                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id()
                cursor.execute(
                    f"INSERT INTO notifications (user_id, is_read, time, question_id) VALUES ({ph}, {ph}, {ph}, {ph})",
                    (prev_editor_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
                )
                notification_id = cursor.lastrowid  # 挿入された通知のID
                conn.commit()
                
                # 🔹 `notifications_translation` に翻訳を追加（編集者名を含める）
                editor_name = current_user.get("name", "user")
                translations = {
                    "日本語": f"あなたの質問が {editor_name} により削除されました。（ID: {question_id}）",
                    "English": f"Your question has been deleted by {editor_name}. (ID: {question_id})",
                    "Tiếng Việt": f"Câu hỏi của bạn đã bị {editor_name} xóa. (ID: {question_id})",
                    "中文": f"您的问题已被 {editor_name} 删除。(ID: {question_id})",
                    "한국어": f"귀하의 질문이 {editor_name} 님에 의해 삭제되었습니다. (ID: {question_id})",
                    "Português": f"Sua pergunta foi excluída por {editor_name}. (ID: {question_id})",
                    "Español": f"Su pregunta ha sido eliminada por {editor_name}.(ID: {question_id})",
                    "Tagalog": f"Ang tanong mo ay tinanggal ni {editor_name}. (ID: {question_id})",
                    "Bahasa Indonesia": f"Pertanyaan Anda telah dihapus oleh {editor_name}. (ID: {question_id})"
                }
                
                # 各言語の翻訳を `notifications_translation` に追加
                for lang, lang_id in language_mapping.items():
                    cursor.execute(
                        f"""
                        INSERT INTO notifications_translation (notification_id, language_id, messages)
                        VALUES ({ph}, {ph}, {ph})
                        """,
                        (notification_id, lang_id, translations[lang]),
                    )

                conn.commit()  # 翻訳の挿入を確定

        return {"message": f"question_id: {question_id} の質問を削除しました"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")
    
@router.post("/change_category")
async def change_category(request: moveCategoryRequest, current_user: dict = Depends(current_user_info)):
    operator_id = current_user["id"]
    question_id = request.question_id
    new_category_id = request.category_id

    if operator_id is None:
        raise HTTPException(status_code=400, detail="認証情報が取得できません")

    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):

            # 🔍 質問の投稿者・直近編集者 と 元のカテゴリIDを取得
            _ensure_question_editor_columns()
            cursor.execute(f"SELECT user_id, COALESCE(last_editor_id, user_id), category_id FROM question WHERE question_id = {ph}", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} が見つかりません")

            question_owner_id = row['user_id']
            prev_editor_id = row['COALESCE(last_editor_id, user_id)']
            original_category_id = row['category_id']

            # 📌 各言語でカテゴリ名を取得（`category_translation` テーブルから）
            cursor.execute(f"SELECT language_id, description FROM category_translation WHERE category_id = {ph}", (original_category_id,))
            original_category_translations = {row['language_id']: row['description'] for row in cursor.fetchall()}

            cursor.execute(f"SELECT language_id, description FROM category_translation WHERE category_id = {ph}", (new_category_id,))
            new_category_translations = {row['language_id']: row['description'] for row in cursor.fetchall()}

            # 🔄 category_id を更新
            cursor.execute(f"UPDATE question SET category_id = {ph} WHERE question_id = {ph}", (new_category_id, question_id))
            conn.commit()
            
            # mark last editor
            try:
                _ensure_question_editor_columns()
                cursor.execute(
                    f"UPDATE question SET last_editor_id = {ph}, last_edited_at = {ph} WHERE question_id = {ph}",
                    (operator_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id)
                )
                conn.commit()
            except Exception:
                pass

            # 📢 【通知の登録】直近編集者に通知（自分以外）
            if prev_editor_id and operator_id != prev_editor_id:
                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id()
                cursor.execute(
                    f"INSERT INTO notifications (user_id, is_read, time, question_id) VALUES ({ph}, {ph}, {ph}, {ph})",
                    (prev_editor_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
                )
                notification_id = cursor.lastrowid  # 挿入された通知のID
                conn.commit()

                # 🔹 各言語の翻訳を `notifications_translation` に追加（編集者名を含める）
                editor_name = current_user.get("name", "user")
                translations = {
                    1: f"あなたの質問が {editor_name} により「{original_category_translations.get(1, 'Unknown')}」から「{new_category_translations.get(1, 'Unknown')}」に移動されました。（ID: {question_id}）",
                    2: f"Your question has been moved by {editor_name} from \"{original_category_translations.get(2, 'Unknown')}\" to \"{new_category_translations.get(2, 'Unknown')}\". (ID: {question_id})",
                    3: f"Câu hỏi của bạn đã được {editor_name} chuyển từ \"{original_category_translations.get(3, 'Unknown')}\" sang \"{new_category_translations.get(3, 'Unknown')}\". (ID: {question_id})",
                    4: f"您的问题已被 {editor_name} 从 \"{original_category_translations.get(4, 'Unknown')}\" 移动到 \"{new_category_translations.get(4, 'Unknown')}\"。(ID: {question_id})",
                    5: f"귀하의 질문이 {editor_name} 님에 의해 \"{original_category_translations.get(5, 'Unknown')}\"에서 \"{new_category_translations.get(5, 'Unknown')}\"(으)로 이동되었습니다. (ID: {question_id})",
                    6: f"Sua pergunta foi movida por {editor_name} de \"{original_category_translations.get(6, 'Unknown')}\" para \"{new_category_translations.get(6, 'Unknown')}\". (ID: {question_id})",
                    7: f"Su pregunta ha sido movida por {editor_name} de \"{original_category_translations.get(7, 'Unknown')}\" a \"{new_category_translations.get(7, 'Unknown')}\". (ID: {question_id})",
                    8: f"Ang iyong tanong ay inilipat ni {editor_name} mula sa \"{original_category_translations.get(8, 'Unknown')}\" patungo sa \"{new_category_translations.get(8, 'Unknown')}\". (ID: {question_id})",
                    9: f"Pertanyaan Anda telah dipindahkan oleh {editor_name} dari \"{original_category_translations.get(9, 'Unknown')}\" ke \"{new_category_translations.get(9, 'Unknown')}\". (ID: {question_id})"
                }

                for lang_id, message in translations.items():
                    cursor.execute(
                        f"""
                        INSERT INTO notifications_translation (notification_id, language_id, messages)
                        VALUES ({ph}, {ph}, {ph})
                        """,
                        (notification_id, lang_id, message),
                    )

                conn.commit()  # 翻訳の挿入を確定

        return {
            "message": f"質問 {question_id} をカテゴリ '{original_category_translations.get(1, 'Unknown')}' から '{new_category_translations.get(1, 'Unknown')}' に移動しました。"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")


@router.post("/register_question")
async def register_question(
    request: RegisterQuestionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(current_user_info)
):
    user_id = current_user["id"]
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)
    
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        japan_time = datetime.utcnow() + timedelta(hours=9)
        # 質問を登録
        cursor.execute(
            f"""
            INSERT INTO question (category_id, time, language_id, user_id, title, content, public)
            VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
            """,
            (request.category_id, japan_time, language_id, user_id, "", request.content, request.public)
        )

        question_id = cursor.lastrowid

        # 元言語の質問を question_translation に格納
        cursor.execute(
            f"""
            INSERT INTO question_translation (question_id, language_id, texts)
            VALUES ({ph}, {ph}, {ph})
            """,
            (question_id, language_id, request.content)
        )

        conn.commit()  # 質問挿入後にコミット
        # initialize last editor as creator at creation time
        try:
            _ensure_question_editor_columns()
            cursor.execute(
                f"UPDATE question SET last_editor_id = {ph}, last_edited_at = {ph} WHERE question_id = {ph}",
                (user_id, japan_time, question_id)
            )
            conn.commit()
        except Exception:
            pass

        # 各言語に翻訳
        cursor.execute("SELECT id FROM language")
        languages = [r['id'] for r in cursor.fetchall()]
        
        # 質問の全言語翻訳は背景タスクで実行
        
        # 回答を登録
        cursor.execute(
            f"""
            INSERT INTO answer (time, language_id)
            VALUES ({ph}, {ph})
            """,
            (datetime.utcnow(), language_id)
        )
        answer_id = cursor.lastrowid
        
        conn.commit()  # 回答挿入後にコミット
        
        # 回答の元言語を登録
        cursor.execute(
            f"""
            INSERT INTO answer_translation (answer_id, language_id, texts)
            VALUES ({ph}, {ph}, {ph})
            """,
            (answer_id, language_id, request.answer_text)
        )

        conn.commit()  # **元言語の回答を挿入した後にコミット**

        # 回答の全言語翻訳は背景タスクで実行
        
        # QAテーブルに登録
        cursor.execute(
            f"""
            INSERT INTO QA (question_id, answer_id)
            VALUES ({ph}, {ph})
            """,
            (question_id, answer_id)
        )
        
        conn.commit()

        # 📌 新規質問登録時の文法チェック設定初期化（登録言語のみ有効、他言語は無効）
        try:
            _ensure_question_grammar_check_table()
            # 全ての言語に対して文法チェック設定を作成
            for lang_id in languages:
                # 登録された言語（人間が入力したオリジナル言語）のみ有効、他は無効
                grammar_enabled = (lang_id == language_id)
                cursor.execute(
                    f"INSERT INTO question_grammar_check (question_id, language_id, grammar_check_enabled, created_at, updated_at) VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                    (question_id, lang_id, grammar_enabled, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                )
            conn.commit()
        except Exception as e:
            print(f"文法チェック設定の初期化に失敗: {str(e)}")
        
        # 重い処理は背景タスクで実行（翻訳・通知・ベクトル）
        background_tasks.add_task(
            _register_question_background,
            question_id,
            answer_id,
            language_id,
            user_id,
            request.content,
            request.answer_text,
            spoken_language,
        )

    return {
        "question_id": question_id,
        "question_text": request.content,
        "answer_id": answer_id,
        "answer_text": request.answer_text,
        "status": "queued",
    }

async def save_question_with_category(question: str, category_id: int, user_id: int):
    """
    質問をカテゴリとともに保存する関数
    """
    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            cursor.execute(f"""
                INSERT INTO question (content, category_id, user_id, time)
                VALUES ({ph}, {ph}, {ph}, {ph})
            """, (question, category_id, user_id, datetime.now()))
            conn.commit()
    except Exception as e:
        raise RuntimeError("質問の保存に失敗しました")

@router.get("/grammar_check_setting")
async def get_grammar_check_setting(question_id: int, language_id: int = None, current_user: dict = Depends(current_user_info)):
    """ 指定された質問の指定言語での文法チェック設定を取得 """
    
    # 言語IDが指定されていない場合は、ユーザーの使用言語を使用
    if language_id is None:
        spoken_language = current_user.get("spoken_language")
        language_id = language_mapping.get(spoken_language, 1)  # デフォルトは日本語
    
    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            _ensure_question_grammar_check_table()
            
            cursor.execute(f"SELECT grammar_check_enabled FROM question_grammar_check WHERE question_id = {ph} AND language_id = {ph}", (question_id, language_id))
            row = cursor.fetchone()
            
            # デフォルトはFalse（設定が存在しない場合） - 新規質問では無効から始める
            if row:
                grammar_check_enabled = row['grammar_check_enabled']
            else:
                grammar_check_enabled = False
            
            result = {
                "question_id": question_id,
                "language_id": language_id,
                "grammar_check_enabled": bool(grammar_check_enabled)
            }
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")

@router.post("/grammar_check_setting")
async def set_grammar_check_setting(request: dict, current_user: dict = Depends(current_user_info)):
    """ 指定された質問の指定言語での文法チェック設定を変更 """
    question_id = request.get("question_id")
    language_id = request.get("language_id")
    grammar_check_enabled = request.get("grammar_check_enabled", False)
    
    if question_id is None:
        raise HTTPException(status_code=400, detail="question_idが必要です")
    
    # 言語IDが指定されていない場合は、ユーザーの使用言語を使用
    if language_id is None:
        spoken_language = current_user.get("spoken_language")
        language_id = language_mapping.get(spoken_language, 1)  # デフォルトは日本語
    
    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            _ensure_question_grammar_check_table()
            
            # 既存の設定をチェック
            cursor.execute(f"SELECT question_id FROM question_grammar_check WHERE question_id = {ph} AND language_id = {ph}", (question_id, language_id))
            exists = cursor.fetchone()
            
            if exists:
                # 更新
                cursor.execute(
                    f"UPDATE question_grammar_check SET grammar_check_enabled = {ph}, updated_at = {ph} WHERE question_id = {ph} AND language_id = {ph}",
                    (grammar_check_enabled, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id, language_id)
                )
            else:
                # 新規作成
                cursor.execute(
                    f"INSERT INTO question_grammar_check (question_id, language_id, grammar_check_enabled, created_at, updated_at) VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                    (question_id, language_id, grammar_check_enabled, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                )
            
            conn.commit()
            
            result = {
                "question_id": question_id,
                "language_id": language_id,
                "grammar_check_enabled": bool(grammar_check_enabled),
                "message": "文法チェック設定が更新されました"
            }
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")

@router.post("/initialize_all_grammar_check")
async def initialize_all_grammar_check(current_user: dict = Depends(current_user_info)):
    """ 全ての既存質問に対してデフォルトで文法チェック有効設定を追加 """
    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            _ensure_question_grammar_check_table()
            
            # 全ての質問IDと言語IDを取得
            cursor.execute("SELECT question_id FROM question")
            all_questions = [r['question_id'] for r in cursor.fetchall()]
            
            cursor.execute("SELECT id FROM language")
            all_languages = [r['id'] for r in cursor.fetchall()]
            
            initialized_count = 0
            for question_id in all_questions:
                for language_id in all_languages:
                    # 既存の設定をチェック
                    cursor.execute(f"SELECT question_id FROM question_grammar_check WHERE question_id = {ph} AND language_id = {ph}", (question_id, language_id))
                    exists = cursor.fetchone()
                    
                    if not exists:
                        # 文法チェックを無効にしてレコードを作成
                        cursor.execute(
                            f"INSERT INTO question_grammar_check (question_id, language_id, grammar_check_enabled, created_at, updated_at) VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                            (question_id, language_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                        )
                        initialized_count += 1
            
            conn.commit()
            
            return {
                "message": f"{initialized_count}件の質問・言語ペアに文法チェック設定を初期化しました（デフォルト: 無効）",
                "initialized_count": initialized_count,
                "total_questions": len(all_questions),
                "total_languages": len(all_languages)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")

# ----- Background task helpers -------------------------------------------------
def _background_translate_all_languages(
    answer_id: int,
    question_id: int,
    new_text: str,
    source_language_id: int,
    source_lang_code: str,
    operator_id: int,
    editor_name: str,
    language_label_to_code: dict
):
    """全言語への翻訳をバックグラウンドで実行"""
    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            # 翻訳対象の言語を取得（元の言語を除外）
            cursor.execute(f"SELECT id, code FROM language WHERE id != {ph}", (source_language_id,))
            target_languages = cursor.fetchall()

            for row in target_languages:
                target_id = row['id'] if isinstance(row, dict) else row[0]
                target_code = (row['code'] if isinstance(row, dict) else row[1]).lower()
                if (target_code == "zh"):
                    target_code = "zh-CN"

                translated_text = translate(
                    new_text,
                    source_language=source_lang_code,
                    target_language=target_code
                )

                cursor.execute(f"""
                    SELECT 1 FROM answer_translation WHERE answer_id = {ph} AND language_id = {ph}
                """, (answer_id, target_id))
                exists = cursor.fetchone()

                if exists:
                    # 履歴の保存（既存テキストがある場合）
                    try:
                        cursor.execute(
                            f"SELECT texts FROM answer_translation WHERE answer_id = {ph} AND language_id = {ph}",
                            (answer_id, target_id),
                        )
                        prev = cursor.fetchone()
                        prev_text = prev['texts'] if (prev and isinstance(prev, dict)) else (prev[0] if prev else None)
                        if prev_text and prev_text != translated_text:
                            cursor.execute(
                                f"""
                                INSERT INTO answer_translation_history (answer_id, language_id, texts, edited_at, editor_user_id, editor_name)
                                VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                                """,
                                (
                                    answer_id,
                                    target_id,
                                    prev_text,
                                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                    operator_id,
                                    editor_name,
                                ),
                            )
                    except Exception:
                        pass

                    cursor.execute(f"""
                        UPDATE answer_translation
                        SET texts = {ph}
                        WHERE answer_id = {ph} AND language_id = {ph}
                    """, (translated_text, answer_id, target_id))
                else:
                    cursor.execute(f"""
                        INSERT INTO answer_translation (answer_id, language_id, texts)
                        VALUES ({ph}, {ph}, {ph})
                    """, (answer_id, target_id, translated_text))

            conn.commit()

            # ベクトル更新（全言語）
            try:
                updated_languages = list(language_label_to_code.values())
                ignore_current_vectors_for_qa_languages(question_id, answer_id, updated_languages)
                append_qa_to_vector_index_for_languages(question_id, answer_id, updated_languages)
            except Exception as e:
                print(f"ベクトル更新エラー: {str(e)}")
                
            print(f"✅ バックグラウンド翻訳完了: answer_id={answer_id}, question_id={question_id}")
    except Exception as e:
        print(f"❌ バックグラウンド翻訳エラー: {str(e)}")

import sqlite3
from datetime import datetime,timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from api.routes.user import current_user_info
from api.utils.translator import question_translate, answer_translate
from config import DATABASE, language_mapping
from api.utils.translator import translate
from models.schemas import QuestionRequest, moveCategoryRequest, RegisterQuestionRequest
from api.utils.RAG import append_qa_to_vector_index, add_qa_id_to_ignore, ignore_current_vectors_for_qa
from fastapi import BackgroundTasks
router = APIRouter()

# ----- Answer history helpers -------------------------------------------------
def _ensure_answer_translation_history(conn: sqlite3.Connection) -> None:
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS answer_translation_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                answer_id INTEGER NOT NULL,
                language_id INTEGER NOT NULL,
                texts TEXT NOT NULL,
                edited_at DATETIME NOT NULL,
                editor_user_id INTEGER,
                editor_name TEXT
            )
            """
        )
        # Indexes for efficient lookups
        cur.execute("CREATE INDEX IF NOT EXISTS idx_ath_answer_lang ON answer_translation_history(answer_id, language_id)")
        conn.commit()
    except Exception:
        pass

# Ensure notifications table has question_id column
def _ensure_notifications_question_id(conn: sqlite3.Connection):
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(notifications)")
        cols = [row[1] for row in cur.fetchall()]
        if "question_id" not in cols:
            cur.execute("ALTER TABLE notifications ADD COLUMN question_id INTEGER")
            conn.commit()
            # mark last editor for this question due to answer edit
            try:
                _ensure_question_editor_columns(conn)
                cursor.execute(
                    "UPDATE question SET last_editor_id = ?, last_edited_at = ? WHERE question_id = ?",
                    (operator_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id)
                )
                conn.commit()
            except Exception:
                pass
            # mark last editor to operator for this question
            try:
                _ensure_question_editor_columns(conn)
                cursor.execute(
                    "UPDATE question SET last_editor_id = ?, last_edited_at = ? WHERE question_id = ?",
                    (operator_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id)
                )
                conn.commit()
            except Exception:
                pass
    except Exception:
        pass

# Ensure question table has last editor fields
def _ensure_question_editor_columns(conn: sqlite3.Connection):
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(question)")
        cols = [row[1] for row in cur.fetchall()]
        changed = False
        if "last_editor_id" not in cols:
            cur.execute("ALTER TABLE question ADD COLUMN last_editor_id INTEGER")
            changed = True
        if "last_edited_at" not in cols:
            cur.execute("ALTER TABLE question ADD COLUMN last_edited_at DATETIME")
            changed = True
        if changed:
            conn.commit()
    except Exception:
        pass

@router.post("/answer_edit")
def answer_edit(request: dict, current_user: dict = Depends(current_user_info)):
    """ 回答を編集し、翻訳データを更新 + 通知を作成 """
    operator_id = current_user["id"]
    if operator_id is None:
        raise HTTPException(status_code=400, detail="認証情報が取得できません")

    spoken_language = current_user.get("spoken_language")
    language_id = language_mapping.get(spoken_language)
    answer_id = request.get("answer_id")

    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()

            # 🔍 `QA` テーブルから `question_id` を取得
            cursor.execute("SELECT question_id FROM QA WHERE answer_id = ?", (answer_id,))
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"回答 {answer_id} に対応する質問が見つかりません")

            question_id = row[0]

            # 🔍 `question` テーブルから 投稿者 と 直近編集者 を取得
            _ensure_question_editor_columns(conn)
            cursor.execute("SELECT user_id, COALESCE(last_editor_id, user_id) FROM question WHERE question_id = ?", (question_id,))
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} の投稿者が見つかりません")
            question_owner_id = row[0]
            prev_editor_id = row[1]

            # 先に現行のベクトルを無効化（各言語のハッシュを記録）
            try:
                ignore_current_vectors_for_qa(question_id, answer_id)
            except Exception:
                pass

            # 🔄 `answer_translation` テーブルを更新（履歴保存付き）
            _ensure_answer_translation_history(conn)

            # まず、編集対象言語の現行テキストを履歴へ保存（差分があるときのみ）
            try:
                cursor.execute(
                    "SELECT texts FROM answer_translation WHERE answer_id = ? AND language_id = ?",
                    (answer_id, language_id),
                )
                row_cur = cursor.fetchone()
                if row_cur and row_cur[0] and row_cur[0] != request.get("new_text"):
                    cursor.execute(
                        """
                        INSERT INTO answer_translation_history (answer_id, language_id, texts, edited_at, editor_user_id, editor_name)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            answer_id,
                            language_id,
                            row_cur[0],
                            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            operator_id,
                            current_user.get("name", "user"),
                        ),
                    )
            except Exception:
                pass

            # 対象言語の現行テキストを更新
            cursor.execute("""
                UPDATE answer_translation
                SET texts = ?
                WHERE answer_id = ? AND language_id = ?
            """, (request.get("new_text"), answer_id, language_id))

            # 回答本体の更新時刻を更新（最終編集日時として利用）
            try:
                cursor.execute(
                    "UPDATE answer SET time = ? WHERE id = ?",
                    (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), answer_id),
                )
            except Exception:
                pass

            # 4. 翻訳対象の言語を取得（元の言語を除外）
            cursor.execute("SELECT id, code FROM language WHERE id != ?", (language_id,))
            target_languages = cursor.fetchall()

            # 5. 翻訳データを作成し、更新
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

            source_lang_code = language_label_to_code.get(spoken_language, "auto")

            for target_id, target_code in target_languages:
                target_code = target_code.lower()
                if target_code == "zh":
                    target_code = "zh-CN"

                translated_text = translate(
                    request.get("new_text"),
                    source_language=source_lang_code,
                    target_language=target_code
                )

                cursor.execute("""
                    SELECT 1 FROM answer_translation WHERE answer_id = ? AND language_id = ?
                """, (answer_id, target_id))
                exists = cursor.fetchone()

                if exists:
                    # 履歴の保存（既存テキストがある場合）
                    try:
                        cursor.execute(
                            "SELECT texts FROM answer_translation WHERE answer_id = ? AND language_id = ?",
                            (answer_id, target_id),
                        )
                        prev = cursor.fetchone()
                        if prev and prev[0] and prev[0] != translated_text:
                            cursor.execute(
                                """
                                INSERT INTO answer_translation_history (answer_id, language_id, texts, edited_at, editor_user_id, editor_name)
                                VALUES (?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    answer_id,
                                    target_id,
                                    prev[0],
                                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                    operator_id,
                                    current_user.get("name", "user"),
                                ),
                            )
                    except Exception:
                        pass

                    cursor.execute("""
                        UPDATE answer_translation
                        SET texts = ?
                        WHERE answer_id = ? AND language_id = ?
                    """, (translated_text, answer_id, target_id))
                else:
                    cursor.execute("""
                        INSERT INTO answer_translation (answer_id, language_id, texts)
                        VALUES (?, ?, ?)
                    """, (answer_id, target_id, translated_text))

            conn.commit()

            # 🔖 最終編集者を更新（回答編集時）
            try:
                _ensure_question_editor_columns(conn)
                cursor.execute(
                    "UPDATE question SET last_editor_id = ?, last_edited_at = ? WHERE question_id = ?",
                    (operator_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id)
                )
                conn.commit()
            except Exception:
                pass

            # 変更後の内容でベクトルを差分追加（全言語）
            try:
                append_qa_to_vector_index(question_id, answer_id)
            except Exception:
                pass

            # 📢 【通知の登録】直近編集者に個人通知（自分以外）
            if prev_editor_id and operator_id != prev_editor_id:
                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
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
                        """
                        INSERT INTO notifications_translation (notification_id, language_id, messages)
                        VALUES (?, ?, ?)
                        """,
                        (notification_id, lang_id, translations[lang]),
                    )

                conn.commit()  # 翻訳の挿入を確定

        return {"editor_id": operator_id}

    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

def _code_to_language_id(code: str, conn: sqlite3.Connection) -> int:
    cur = conn.cursor()
    cur.execute("SELECT id FROM language WHERE lower(code) = ?", (code.lower(),))
    row = cur.fetchone()
    return int(row[0]) if row else None


@router.get("/answer_history")
def get_answer_history(
    answer_id: int,
    lang: str = Query(None, description="Optional language code like ja/en/vi/zh/ko"),
    current_user: dict = Depends(current_user_info),
):
    """指定した回答の過去翻訳履歴を取得（ユーザーの使用言語で）。古い→新しいの時系列。"""
    spoken_language = current_user.get("spoken_language")
    language_id = None

    try:
        with sqlite3.connect(DATABASE) as conn:
            _ensure_answer_translation_history(conn)
            # Resolve language_id: explicit 'lang' param takes precedence
            if lang:
                language_id = _code_to_language_id(lang, conn)
            if not language_id:
                language_id = language_mapping.get(spoken_language)
            if not language_id:
                raise HTTPException(status_code=400, detail="Unsupported spoken language or lang code")
            cur = conn.cursor()
            cur.execute(
                """
                SELECT texts, edited_at, editor_user_id, COALESCE(editor_name, '')
                FROM answer_translation_history
                WHERE answer_id = ? AND language_id = ?
                ORDER BY edited_at ASC
                """,
                (answer_id, language_id),
            )
            rows = cur.fetchall() or []
        history = [
            {
                "texts": r[0],
                "edited_at": r[1],
                "editor_user_id": r[2],
                "editor_name": r[3],
            }
            for r in rows
        ]
        return {"answer_id": answer_id, "language_id": language_id, "history": history}
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")
    
@router.put("/official_question")
def official_question(request: dict, current_user: dict = Depends(current_user_info)):
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
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()

            # 🔍 投稿者と直近編集者を取得
            _ensure_question_editor_columns(conn)
            cursor.execute("SELECT user_id, COALESCE(last_editor_id, user_id) FROM question WHERE question_id = ?", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} が見つかりません")

            question_owner_id = row[0]
            prev_editor_id = row[1]

            # 🔄 title を更新
            cursor.execute("""UPDATE question SET title=? WHERE question_id=?""", (new_title, question_id))
            conn.commit()
            # mark last editor
            try:
                _ensure_question_editor_columns(conn)
                cursor.execute(
                    "UPDATE question SET last_editor_id = ?, last_edited_at = ? WHERE question_id = ?",
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
                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
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
                        """
                        INSERT INTO notifications_translation (notification_id, language_id, messages)
                        VALUES (?, ?, ?)
                        """,
                        (notification_id, lang_id, translations[lang]),
                    )

                conn.commit()  # 翻訳の挿入を確定

        return {"editor_user_id": operator_id, "question_id": question_id, "new_title": new_title}

    except sqlite3.Error as e:
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
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()

            # 🔍 質問の投稿者・直近編集者を取得
            _ensure_question_editor_columns(conn)
            cursor.execute(
                "SELECT user_id, COALESCE(last_editor_id, user_id) FROM question WHERE question_id = ?",
                (question_id,)
            )
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} が見つかりません")

            question_owner_id = row[0]
            prev_editor_id = row[1]

            # 🔹 `QA` から対象質問の 全レコード を取得（← ここを fetchall に）
            cursor.execute("SELECT id, answer_id FROM QA WHERE question_id = ?", (question_id,))
            qa_rows = cursor.fetchall()
            if not qa_rows:
                # 元の挙動を踏襲（回答が無い場合は404）
                raise HTTPException(status_code=404, detail=f"質問 {question_id} に対応する回答が見つかりません")

            qa_ids = [r[0] for r in qa_rows]
            answer_ids = [r[1] for r in qa_rows]

            # 🧹 ベクトルをグローバルに無効化（QA ID 全件）
            try:
                for qa_id in qa_ids:
                    add_qa_id_to_ignore(qa_id)
            except Exception:
                pass

            # 🔹 データ削除処理（依存順に並べ替え）
            # 1) answer_translation
            if answer_ids:
                ph = ",".join("?" * len(answer_ids))
                cursor.execute(f"DELETE FROM answer_translation WHERE answer_id IN ({ph})", answer_ids)

            # 2) answer（PK は id）
            if answer_ids:
                ph = ",".join("?" * len(answer_ids))
                cursor.execute(f"DELETE FROM answer WHERE id IN ({ph})", answer_ids)

            # 3) QA（この質問とのリンクを切る）
            if qa_ids:
                ph = ",".join("?" * len(qa_ids))
                cursor.execute(f"DELETE FROM QA WHERE id IN ({ph})", qa_ids)

            # 4) question_translation
            cursor.execute("DELETE FROM question_translation WHERE question_id = ?", (question_id,))

            # 5) question 本体
            cursor.execute("DELETE FROM question WHERE question_id = ?", (question_id,))

            conn.commit()  # すべての削除を確定

            # 🔥 関連する既存通知をクリーンアップ（削除通知を新規作成する前に）
            try:
                _ensure_notifications_question_id(conn)
                cursor.execute("SELECT id FROM notifications WHERE question_id = ?", (question_id,))
                old_notifs = [row[0] for row in cursor.fetchall()]
                if old_notifs:
                    cursor.executemany(
                        "DELETE FROM notifications_translation WHERE notification_id = ?",
                        [(nid,) for nid in old_notifs]
                    )
                    cursor.execute("DELETE FROM notifications WHERE question_id = ?", (question_id,))
                    conn.commit()
            except Exception:
                pass

            # 📢 【通知の登録】直近編集者に通知（自分以外） ←（元のロジックそのまま）
            if prev_editor_id and operator_id != prev_editor_id:
                notification_message = f"あなたの質問（ID: {question_id}）が管理者({operator_id})により削除されました。"

                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
                    (prev_editor_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
                )
                notification_id = cursor.lastrowid
                conn.commit()
                
                editor_name = current_user.get("name", "user")
                translations = {
                    "日本語": f"あなたの質問が {editor_name} により削除されました。（ID: {question_id}）",
                    "English": f"Your question has been deleted by {editor_name}. (ID: {question_id})",
                    "Tiếng Việt": f"Câu hỏi của bạn đã bị {editor_name} xóa. (ID: {question_id})",
                    "中文": f"您的问题已被 {editor_name} 删除。(ID: {question_id})",
                    "한국어": f"귀하의質問이 {editor_name} 님에 의해 삭제되었습니다. (ID: {question_id})",
                    "Português": f"Sua pergunta foi excluída por {editor_name}. (ID: {question_id})",
                    "Español": f"Su pregunta ha sido eliminada por {editor_name}.(ID: {question_id})",
                    "Tagalog": f"Ang tanong mo ay tinanggal ni {editor_name}. (ID: {question_id})",
                    "Bahasa Indonesia": f"Pertanyaan Anda telah dihapus oleh {editor_name}. (ID: {question_id})"
                }
                for lang, lang_id in language_mapping.items():
                    cursor.execute(
                        """
                        INSERT INTO notifications_translation (notification_id, language_id, messages)
                        VALUES (?, ?, ?)
                        """,
                        (notification_id, lang_id, translations[lang]),
                    )
                conn.commit()

        return {"message": f"question_id: {question_id} の質問を削除しました"}

    except sqlite3.Error as e:
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
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()

            # 🔍 質問の投稿者・直近編集者 と 元のカテゴリIDを取得
            _ensure_question_editor_columns(conn)
            cursor.execute("SELECT user_id, COALESCE(last_editor_id, user_id), category_id FROM question WHERE question_id = ?", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} が見つかりません")

            question_owner_id, prev_editor_id, original_category_id = row

            # 📌 各言語でカテゴリ名を取得（`category_translation` テーブルから）
            cursor.execute("SELECT language_id, description FROM category_translation WHERE category_id = ?", (original_category_id,))
            original_category_translations = {lang_id: desc for lang_id, desc in cursor.fetchall()}

            cursor.execute("SELECT language_id, description FROM category_translation WHERE category_id = ?", (new_category_id,))
            new_category_translations = {lang_id: desc for lang_id, desc in cursor.fetchall()}

            # 🔄 category_id を更新
            cursor.execute("UPDATE question SET category_id = ? WHERE question_id = ?", (new_category_id, question_id))
            conn.commit()
            # mark last editor
            try:
                _ensure_question_editor_columns(conn)
                cursor.execute(
                    "UPDATE question SET last_editor_id = ?, last_edited_at = ? WHERE question_id = ?",
                    (operator_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id)
                )
                conn.commit()
            except Exception:
                pass

            # 📢 【通知の登録】直近編集者に通知（自分以外）
            if prev_editor_id and operator_id != prev_editor_id:
                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
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
                        """
                        INSERT INTO notifications_translation (notification_id, language_id, messages)
                        VALUES (?, ?, ?)
                        """,
                        (notification_id, lang_id, message),
                    )

                conn.commit()  # 翻訳の挿入を確定

        return {
            "message": f"質問 {question_id} をカテゴリ '{original_category_translations.get(1, 'Unknown')}' から '{new_category_translations.get(1, 'Unknown')}' に移動しました。"
        }

    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


@router.post("/change_public")
def change_public(request: dict, current_user: dict = Depends(current_user_info)):
    question_id = request.get("question_id")
    operator_id = current_user["id"]  # 現在の操作ユーザー

    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()

            # 🔍 質問の現在の状態と、投稿者・直近編集者を取得
            _ensure_question_editor_columns(conn)
            cursor.execute("SELECT public, user_id, COALESCE(last_editor_id, user_id) FROM question WHERE question_id = ?", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail="指定された質問が見つかりません")

            current_status, question_owner_id, prev_editor_id = row

            # 公開状態を反転
            new_status = 1 if current_status == 0 else 0
            status_text = "公開" if new_status == 1 else "非公開"

            # 質問の public 状態を反転
            new_status = 1 if current_status == 0 else 0

            # 🔄 public 状態を更新
            cursor.execute("UPDATE question SET public = ? WHERE question_id = ?", (new_status, question_id))
            conn.commit()
            # mark last editor
            try:
                _ensure_question_editor_columns(conn)
                cursor.execute(
                    "UPDATE question SET last_editor_id = ?, last_edited_at = ? WHERE question_id = ?",
                    (operator_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id)
                )
                conn.commit()
            except Exception:
                pass

            # 📢 【通知の登録】直近編集者に通知（自分以外）
            if prev_editor_id and operator_id != prev_editor_id:
                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
                    (prev_editor_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
                )
                notification_id = cursor.lastrowid  # 挿入された通知のID
                conn.commit()

                # 🔹 `notifications_translation` に翻訳を追加
                translations = {
                    "日本語": f"あなたの質問の公開設定が管理者により「{status_text}」に変更されました。（ID: {question_id}）",
                    "English": f"The visibility of your question has been changed to \"{status_text}\" by the administrator. (ID: {question_id}) ",
                    "Tiếng Việt": f"Cài đặt quyền riêng tư của câu hỏi của bạn đã được quản trị viên thay đổi thành \"{status_text}\".(ID: {question_id}) ",
                    "中文": f"您的问题的可见性已被管理员更改为 \"{status_text}\"。（ID: {question_id}）",
                    "한국어": f"귀하의 질문 의 공개 설정이 관리자 에 의해 \"{status_text}\"(으)로 변경되었습니다.(ID: {question_id})"
                }

                # 各言語の翻訳を `notifications_translation` に追加
                for lang, lang_id in language_mapping.items():
                    cursor.execute(
                        """
                        INSERT INTO notifications_translation (notification_id, language_id, messages)
                        VALUES (?, ?, ?)
                        """,
                        (notification_id, lang_id, translations[lang]),
                    )

                conn.commit()  # 翻訳の挿入を確定

            return {"question_id": question_id, "public": new_status}

    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")
    


def save_question_with_category(question: str, category_id: int, user_id: int):
    """
    質問をカテゴリとともに保存する関数
    """
    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO question (content, category_id, user_id, time)
                VALUES (?, ?, ?, ?)
            """, (question, category_id, user_id, datetime.now()))
            conn.commit()
    except sqlite3.Error as e:
        raise RuntimeError("質問の保存に失敗しました")
    # routes/admin.py（完全版）
import sqlite3
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

# 既存の定義を流用する前提:
# - DATABASE: str
# - language_mapping = {"日本語":1, "English":2, ...}
# - current_user_info: FastAPI dependency
# - RegisterQuestionRequest: Pydantic model (category_id:int, content:str, public:bool, answer_text:str など)
# - _ensure_question_editor_columns(conn)
# - _ensure_notifications_question_id(conn)
# - append_qa_to_vector_index(question_id:int, answer_id:int)
# - translate(text:str, src_lang_code:str, tgt_lang_code:str) -> str  ← 外部翻訳APIの関数（例: DeepL/Google等）

router = APIRouter()

# ---- i18n: 通知メッセージ（ラベル名ベース） ----
NEW_QUESTION_TRANSLATIONS = {
    "日本語": "新しい質問が登録されました",
    "English": "New question has been registered",
    "Tiếng Việt": "Câu hỏi mới đã được đăng ký",
    "中文": "新问题已注册",
    "한국어": "새로운 질문이 등록되었습니다",
    "Português": "Nova pergunta foi registrada",
    "Español": "Se ha registrado una nueva pregunta",
    "Tagalog": "Isang bagong tanong ang nairehistro",
    "Bahasa Indonesia": "Pertanyaan baru telah terdaftar",
}
BY_USER_TRANSLATIONS = {
    "日本語": "登録者",
    "English": "by",
    "Tiếng Việt": "bởi",
    "中文": "由",
    "한국어": "登録者",
    "Português": "por",
    "Español": "por",
    "Tagalog": "ni",
    "Bahasa Indonesia": "oleh",
}

# ---- 言語解決（コード/ラベルどちらでもOK） ----
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

def resolve_language_id(spoken_language: str) -> Optional[int]:
    if not spoken_language:
        return None
    s = spoken_language.strip()
    # ラベル優先（"日本語", "English"...）
    if s in language_mapping:
        return language_mapping[s]
    # コード（"ja","en"...）
    return language_code_to_id.get(s.lower())

def get_reverse_language_map():
    # id -> ラベル名（通知用に使う）
    return {v: k for k, v in language_mapping.items()}

def now_jst():
    return datetime.utcnow() + timedelta(hours=9)

# ---- 翻訳コードマッピング（翻訳API用のコードに変換） ----
_TRANSLATION_LANG_MAP = {
    "ja": "ja",      # 日本語
    "en": "en",      # 英語
    "vi": "vi",      # ベトナム語
    "zh": "zh-CN",   # 中国語(簡体)
    "ko": "ko",      # 韓国語
    "pt": "pt",      # ポルトガル語
    "es": "es",      # スペイン語
    "tl": "tl",      # タガログ語
    "id": "id",      # インドネシア語
}

def _get_lang_code(conn, lang_id: int) -> str:
    cur = conn.cursor()
    cur.execute("SELECT code FROM language WHERE id = ?", (lang_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"language id {lang_id} not found")
    return row[0].lower()

def _map_to_translator_code(code: str) -> str:
    mapped = _TRANSLATION_LANG_MAP.get(code.lower())
    if not mapped:
        raise HTTPException(status_code=400, detail=f"unsupported language code: {code}")
    return mapped

# ---- 実翻訳（翻訳APIの関数 translate を呼ぶ） ----
def _translate_text(text: str, src_code: str, tgt_code: str) -> str:
    return translate(text, src_code, tgt_code)  # 既存の翻訳関数を利用（例: DeepL/Google等）

# ---- BG/同期両用: 質問の翻訳をUPSERT ----
def question_translate_internal(question_id: int, target_language_id: int) -> None:
    with sqlite3.connect(DATABASE, check_same_thread=False) as conn:
        cur = conn.cursor()

        # 元の質問本文と元言語
        cur.execute(
            "SELECT content, language_id FROM question WHERE question_id = ?",
            (question_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="question not found")
        original_content, src_lang_id = row

        if src_lang_id == target_language_id:
            return  # 同一言語→何もしない

        # 言語コード(DB)→翻訳API用に変換
        src_code_db = _get_lang_code(conn, src_lang_id)
        tgt_code_db = _get_lang_code(conn, target_language_id)
        src_code = _map_to_translator_code(src_code_db)
        tgt_code = _map_to_translator_code(tgt_code_db)

        translated = _translate_text(original_content, src_code, tgt_code)

        # (question_id, language_id) でUPSERT
        cur.execute(
            """
            INSERT INTO question_translation (question_id, language_id, texts)
            VALUES (?, ?, ?)
            ON CONFLICT(question_id, language_id)
            DO UPDATE SET texts = excluded.texts
            """,
            (question_id, target_language_id, translated),
        )
        conn.commit()

# ---- BG/同期両用: 回答の翻訳をUPSERT ----
def answer_translate_internal(answer_id: int, target_language_id: int) -> None:
    with sqlite3.connect(DATABASE, check_same_thread=False) as conn:
        cur = conn.cursor()

        # 回答の元言語を answer テーブルから取得
        cur.execute("SELECT language_id FROM answer WHERE answer_id = ?", (answer_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="answer not found")
        src_lang_id = row[0]

        if src_lang_id == target_language_id:
            return  # 同一言語→何もしない

        # 元テキスト（元言語の翻訳レコード＝登録時に作成済みの同言語行）
        cur.execute(
            "SELECT texts FROM answer_translation WHERE answer_id = ? AND language_id = ? LIMIT 1",
            (answer_id, src_lang_id),
        )
        row = cur.fetchone()
        if not row:
            # フォールバック: 最初の翻訳を元文とみなす
            cur.execute(
                "SELECT texts FROM answer_translation WHERE answer_id = ? LIMIT 1",
                (answer_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="source answer text not found")
        original_text = row[0]

        # 言語コード(DB)→翻訳API用に変換
        src_code_db = _get_lang_code(conn, src_lang_id)
        tgt_code_db = _get_lang_code(conn, target_language_id)
        src_code = _map_to_translator_code(src_code_db)
        tgt_code = _map_to_translator_code(tgt_code_db)

        translated = _translate_text(original_text, src_code, tgt_code)

        # (answer_id, language_id) でUPSERT
        cur.execute(
            """
            INSERT INTO answer_translation (answer_id, language_id, texts)
            VALUES (?, ?, ?)
            ON CONFLICT(answer_id, language_id)
            DO UPDATE SET texts = excluded.texts
            """,
            (answer_id, target_language_id, translated),
        )
        conn.commit()

# ---- 通知翻訳の不足分を埋める ----
def fill_missing_notification_translations(notification_id: int, question_id: int, nickname: str, snippet_length: int = 50):
    reverse_map = get_reverse_language_map()
    with sqlite3.connect(DATABASE, check_same_thread=False) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT language_id FROM notifications_translation WHERE notification_id = ?",
            (notification_id,),
        )
        already = {row[0] for row in cur.fetchall()}
        cur.execute(
            "SELECT language_id, texts FROM question_translation WHERE question_id = ?",
            (question_id,),
        )
        for lang_id, text in cur.fetchall():
            if lang_id in already:
                continue
            lang_name = reverse_map.get(lang_id, "English")
            prefix = NEW_QUESTION_TRANSLATIONS.get(lang_name, NEW_QUESTION_TRANSLATIONS["English"])
            by_label = BY_USER_TRANSLATIONS.get(lang_name, BY_USER_TRANSLATIONS["English"])
            snippet = text[:snippet_length] + ("..." if len(text) > snippet_length else "")
            msg = f"{prefix}（{by_label}: {nickname}）: {snippet}"
            cur.execute(
                """
                INSERT INTO notifications_translation (notification_id, language_id, messages)
                VALUES (?, ?, ?)
                """,
                (notification_id, lang_id, msg),
            )
        conn.commit()


# ---- 実翻訳（translate() は既存の外部API呼び出し関数） ----
_TRANSLATION_LANG_MAP = {
    "ja": "ja", "en": "en", "vi": "vi", "zh": "zh-CN",
    "ko": "ko", "pt": "pt", "es": "es", "tl": "tl", "id": "id",
}

def _get_lang_code(conn, lang_id: int) -> str:
    cur = conn.cursor()
    cur.execute("SELECT code FROM language WHERE id = ?", (lang_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"language id {lang_id} not found")
    return row[0].lower()

def _map_to_translator_code(code: str) -> str:
    mapped = _TRANSLATION_LANG_MAP.get(code.lower())
    if not mapped:
        raise HTTPException(status_code=400, detail=f"unsupported language code: {code}")
    return mapped

def question_translate_internal(question_id: int, target_language_id: int) -> None:
    with sqlite3.connect(DATABASE, check_same_thread=False) as conn:
        cur = conn.cursor()
        cur.execute("SELECT content, language_id FROM question WHERE question_id = ?", (question_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="question not found")
        src_text, src_lang_id = row
        if src_lang_id == target_language_id:
            return
        src_code = _map_to_translator_code(_get_lang_code(conn, src_lang_id))
        tgt_code = _map_to_translator_code(_get_lang_code(conn, target_language_id))
        translated = translate(src_text, src_code, tgt_code)
        cur.execute("""
            INSERT INTO question_translation (question_id, language_id, texts)
            VALUES (?, ?, ?)
            ON CONFLICT(question_id, language_id) DO UPDATE SET texts = excluded.texts
        """, (question_id, target_language_id, translated))
        conn.commit()

def answer_translate_internal(answer_id: int, target_language_id: int) -> None:
    with sqlite3.connect(DATABASE, check_same_thread=False) as conn:
        cur = conn.cursor()
        cur.execute("SELECT language_id FROM answer WHERE id = ? LIMIT 1", (answer_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="answer not found")
        src_lang_id = row[0]
        if src_lang_id == target_language_id:
            return
        # 元言語の回答本文を取得（登録時に入れた同言語行）
        cur.execute("""
            SELECT texts FROM answer_translation
            WHERE answer_id = ? AND language_id = ? LIMIT 1
        """, (answer_id, src_lang_id))
        row = cur.fetchone()
        if not row:
            cur.execute("SELECT texts FROM answer_translation WHERE answer_id = ? LIMIT 1", (answer_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="source answer text not found")
        src_text = row[0]
        src_code = _map_to_translator_code(_get_lang_code(conn, src_lang_id))
        tgt_code = _map_to_translator_code(_get_lang_code(conn, target_language_id))
        translated = translate(src_text, src_code, tgt_code)
        cur.execute("""
            INSERT INTO answer_translation (answer_id, language_id, texts)
            VALUES (?, ?, ?)
            ON CONFLICT(answer_id, language_id) DO UPDATE SET texts = excluded.texts
        """, (answer_id, target_language_id, translated))
        conn.commit()

# ---- BGラッパ（例外は握りつぶし: 起動やレスポンスに影響させない） ----
def _bg_question_translate(question_id: int, target_lang_id: int):
    try:
        question_translate_internal(question_id, target_lang_id)   # ← 差し替え
    except Exception as e:
        print(f"[bg] question_translate_internal failed: {e}")

def _bg_answer_translate(answer_id: int, target_lang_id: int):
    try:
        answer_translate_internal(answer_id, target_lang_id)       # ← 差し替え
    except Exception as e:
        print(f"[bg] answer_translate_internal failed: {e}")


def _bg_fill_notifications(notification_id: int, question_id: int, nickname: str):
    try:
        fill_missing_notification_translations(notification_id, question_id, nickname)
    except Exception:
        pass

# ---- エンドポイント ----
@router.post("/register_question")
async def register_question(
    request: "RegisterQuestionRequest",
    background_tasks: BackgroundTasks,                 # ← FastAPIが自動注入（Dependsは不要）
    current_user: dict = Depends(current_user_info),  # ← 依存性はデフォルト扱いなので、defaultなし引数より後ろに置かない
):
    user_id = current_user["id"]
    spoken_language = current_user.get("spoken_language")
    language_id = resolve_language_id(spoken_language)
    if not language_id:
        raise HTTPException(status_code=400, detail="Unsupported spoken_language")

    jst = now_jst()
    reverse_map = get_reverse_language_map()
    nickname = current_user.get("name", "user")

    with sqlite3.connect(DATABASE, check_same_thread=False) as conn:
        cur = conn.cursor()

        # 質問（元言語のみを同期登録）
        cur.execute(
            """
            INSERT INTO question (category_id, time, language_id, user_id, title, content, public)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (request.category_id, jst, language_id, user_id, "", request.content, request.public),
        )
        question_id = cur.lastrowid

        # 元言語の質問翻訳（＝元文）
        cur.execute(
            "INSERT INTO question_translation (question_id, language_id, texts) VALUES (?, ?, ?)",
            (question_id, language_id, request.content),
        )

        # 最終編集者（ある場合のみ）
        try:
            _ensure_question_editor_columns(conn)
            cur.execute(
                "UPDATE question SET last_editor_id = ?, last_edited_at = ? WHERE question_id = ?",
                (user_id, jst, question_id),
            )
        except Exception:
            pass

        # 回答（元言語のみ）
        cur.execute(
            "INSERT INTO answer (time, language_id) VALUES (?, ?)",
            (jst, language_id),
        )
        answer_id = cur.lastrowid
        cur.execute(
            "INSERT INTO answer_translation (answer_id, language_id, texts) VALUES (?, ?, ?)",
            (answer_id, language_id, request.answer_text),
        )

        # QAリンク
        cur.execute(
            "INSERT INTO QA (question_id, answer_id) VALUES (?, ?)",
            (question_id, answer_id),
        )

        # 通知（まずは元言語のみ）
        _ensure_notifications_question_id(conn)
        cur.execute(
            """
            INSERT INTO notifications (user_id, is_read, time, global_read_users, question_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (-1, False, jst, '[]', question_id),
        )
        notification_id = cur.lastrowid

        snippet = request.content[:50] + ("..." if len(request.content) > 50 else "")
        lang_name = reverse_map.get(language_id, "English")
        prefix = NEW_QUESTION_TRANSLATIONS.get(lang_name, NEW_QUESTION_TRANSLATIONS["English"])
        by_label = BY_USER_TRANSLATIONS.get(lang_name, BY_USER_TRANSLATIONS["English"])
        msg = f"{prefix}（{by_label}: {nickname}）: {snippet}"
        cur.execute(
            "INSERT INTO notifications_translation (notification_id, language_id, messages) VALUES (?, ?, ?)",
            (notification_id, language_id, msg),
        )

        # 全言語IDを取得（接続を閉じる前に）
        cur.execute("SELECT id FROM language")
        all_lang_ids = [row[0] for row in cur.fetchall()]

        conn.commit()

    # ---- BG: 他言語へ翻訳・通知補完 ----
    for tid in all_lang_ids:
        if tid != language_id:
            background_tasks.add_task(_bg_question_translate, question_id, tid)
    for tid in all_lang_ids:
        if tid != language_id:
            background_tasks.add_task(_bg_answer_translate, answer_id, tid)
    background_tasks.add_task(_bg_fill_notifications, notification_id, question_id, nickname)

    # ベクトルインデックスは非致命
    try:
        append_qa_to_vector_index(question_id, answer_id)
    except Exception:
        pass

    return {
        "question_id": question_id,
        "question_text": request.content,
        "answer_id": answer_id,
        "answer_text": request.answer_text,
    }

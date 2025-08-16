import sqlite3
from datetime import datetime,timedelta
from fastapi import APIRouter, HTTPException, Depends
from api.routes.user import current_user_info
from api.utils.translator import question_translate, answer_translate
from config import DATABASE, language_mapping
from api.utils.translator import translate
from models.schemas import QuestionRequest, moveCategoryRequest, RegisterQuestionRequest
router = APIRouter()

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

            # 🔍 `question` テーブルから `user_id` を取得（質問の投稿者）
            cursor.execute("SELECT user_id FROM question WHERE question_id = ?", (question_id,))
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} の投稿者が見つかりません")

            question_owner_id = row[0]  # 回答の元の質問の投稿者

            # 🔄 `answer_translation` テーブルを更新
            cursor.execute("""
                UPDATE answer_translation
                SET texts = ?
                WHERE answer_id = ? AND language_id = ?
            """, (request.get("new_text"), answer_id, language_id))

            # 4. 翻訳対象の言語を取得（元の言語を除外）
            cursor.execute("SELECT id, code FROM language WHERE id != ?", (language_id,))
            target_languages = cursor.fetchall()

            # 5. 翻訳データを作成し、更新
            language_label_to_code = {
                "日本語": "ja",
                "English": "en",
                "Tiếng Việt": "vi",
                "中文": "zh-CN",
                "한국어": "ko"
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

            # 📢 【通知の登録】投稿者以外が編集した場合のみ（質問者に個人通知）
            if operator_id != question_owner_id:
                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
                    (question_owner_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
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
                    "한국어": f"귀하의 질문에 대한 답변이 {editor_name} 님에 의해 수정되었습니다."
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

            # 🔍 質問の投稿者 (`question_owner_id`) を取得
            cursor.execute("SELECT user_id FROM question WHERE question_id = ?", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} が見つかりません")

            question_owner_id = row[0]

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

            # 📢 【通知の登録】投稿者以外が変更した場合のみ
            if operator_id != question_owner_id:
                notification_message = (
                    f"あなたの質問（ID: {question_id}）が管理者により「{new_title}」に変更されました。"
                )

                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
                    (question_owner_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
                )
                notification_id = cursor.lastrowid  # 挿入された通知のID
                conn.commit()

                # 🔹 `notifications_translation` に翻訳を追加
                translations = {
                    "日本語": f"あなたの質問が管理者により「{new_title}」に変更されました。（ID: {question_id}）",
                    "English": f"Your question has been changed to \"{new_title}\" by the administrator.(ID: {question_id})",
                    "Tiếng Việt": f"Câu hỏi của bạn đã được quản trị viên thay đổi thành \"{new_title}\". (ID: {question_id})",
                    "中文": f"您的问题已被管理员更改为 \"{new_title}\"。（ID: {question_id}）",
                    "한국어": f"귀하의 질문 이 관리자에 의해 \"{new_title}\"(으)로 변경되었습니다.(ID: {question_id})"
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

            # 🔍 質問の投稿者 (`user_id`) を取得
            cursor.execute("SELECT user_id FROM question WHERE question_id = ?", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} が見つかりません")

            question_owner_id = row[0]

            # 🔹 `QA` から `answer_id` を取得
            cursor.execute("SELECT answer_id FROM QA WHERE question_id = ?", (question_id,))
            answer_id_row = cursor.fetchone()

            if not answer_id_row:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} に対応する回答が見つかりません")

            answer_id = answer_id_row[0]

            # 🔹 データ削除処理（トランザクション処理を使用）
            cursor.execute("DELETE FROM question WHERE question_id = ?", (question_id,))
            cursor.execute("DELETE FROM question_translation WHERE question_id = ?", (question_id,))
            cursor.execute("DELETE FROM QA WHERE question_id = ?", (question_id,))
            cursor.execute("DELETE FROM answer_translation WHERE answer_id = ?", (answer_id,))
            cursor.execute("DELETE FROM answer WHERE id = ?", (answer_id,))

            conn.commit()  # すべての削除を確定

            # 📢 【通知の登録】投稿者以外が質問を削除した場合のみ
            if operator_id != question_owner_id:
                notification_message = f"あなたの質問（ID: {question_id}）が管理者({operator_id})により削除されました。"

                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
                    (question_owner_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
                )
                notification_id = cursor.lastrowid  # 挿入された通知のID
                conn.commit()
                
                # 🔹 `notifications_translation` に翻訳を追加
                translations = {
                    "日本語": f"あなたの質問が管理者により削除されました。（ID: {question_id}）",
                    "English": f"Your question has been deleted by the administrator .（ID: {question_id}）",
                    "Tiếng Việt": f"Câu hỏi của bạn đã bị quản trị viên  xóa.（ID: {question_id}）",
                    "中文": f"您的问题已被管理员删除。（ID: {question_id}）",
                    "한국어": f"귀하의 질문 이 관리자 에 의해 삭제되었습니다.（ID: {question_id}）"
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

            # 🔍 質問の投稿者 (`user_id`) と元のカテゴリIDを取得
            cursor.execute("SELECT user_id, category_id FROM question WHERE question_id = ?", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail=f"質問 {question_id} が見つかりません")

            question_owner_id, original_category_id = row

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

            # 📢 【通知の登録】投稿者以外がカテゴリを変更した場合のみ
            if operator_id != question_owner_id:
                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
                    (question_owner_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
                )
                notification_id = cursor.lastrowid  # 挿入された通知のID
                conn.commit()

                # 🔹 各言語の翻訳を `notifications_translation` に追加
                translations = {
                    1: f"あなたの質問が管理者により「{original_category_translations.get(1, 'Unknown')}」から「{new_category_translations.get(1, 'Unknown')}」に移動されました。（ID: {question_id}）",
                    2: f"Your question has been moved from \"{original_category_translations.get(2, 'Unknown')}\" to \"{new_category_translations.get(2, 'Unknown')}\" by the administrator.（ID: {question_id}）",
                    3: f"Câu hỏi của bạn đã được quản trị viên chuyển từ \"{original_category_translations.get(3, 'Unknown')}\" sang \"{new_category_translations.get(3, 'Unknown')}\".（ID: {question_id}）",
                    4: f"您的问题已被管理员从 \"{original_category_translations.get(4, 'Unknown')}\" 移动到 \"{new_category_translations.get(4, 'Unknown')}\"。（ID: {question_id}）",
                    5: f"귀하의 질문 이 관리자에 의해 \"{original_category_translations.get(5, 'Unknown')}\"에서 \"{new_category_translations.get(5, 'Unknown')}\"(으)로 이동되었습니다.（ID: {question_id}）"
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

            # 🔍 質問の現在の状態と、投稿者の user_id を取得
            cursor.execute("SELECT public, user_id FROM question WHERE question_id = ?", (question_id,))
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail="指定された質問が見つかりません")

            current_status, question_owner_id = row

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

            # 📢 【通知の登録】投稿者以外が公開設定を変更した場合のみ
            if operator_id != question_owner_id:
                # 🔹 `notifications` に通知を追加
                _ensure_notifications_question_id(conn)
                cursor.execute(
                    "INSERT INTO notifications (user_id, is_read, time, question_id) VALUES (?, ?, ?, ?)",
                    (question_owner_id, False, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), question_id),
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
    

@router.post("/register_question")
async def register_question(
    request: RegisterQuestionRequest,
    current_user: dict = Depends(current_user_info)
):
    user_id = current_user["id"]
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)
    
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        japan_time = datetime.utcnow() + timedelta(hours=9)
        # 質問を登録
        cursor.execute(
            """
            INSERT INTO question (category_id, time, language_id, user_id, title, content, public)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (request.category_id, japan_time, language_id, user_id, "", request.content, request.public)
        )

        question_id = cursor.lastrowid

        # 元言語の質問を question_translation に格納
        cursor.execute(
            """
            INSERT INTO question_translation (question_id, language_id, texts)
            VALUES (?, ?, ?)
            """,
            (question_id, language_id, request.content)
        )

        conn.commit()  # 質問挿入後にコミット
        # initialize last editor as creator at creation time
        try:
            _ensure_question_editor_columns(conn)
            cursor.execute(
                "UPDATE question SET last_editor_id = ?, last_edited_at = ? WHERE question_id = ?",
                (user_id, japan_time, question_id)
            )
            conn.commit()
        except Exception:
            pass

        # 各言語に翻訳
        cursor.execute("SELECT id FROM language")
        languages = [row[0] for row in cursor.fetchall()]
        
        for target_lang_id in languages:
            try:
                question_translate(question_id, target_lang_id, current_user)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"質問の翻訳に失敗しました: {str(e)}")
        
        # 回答を登録
        cursor.execute(
            """
            INSERT INTO answer (time, language_id)
            VALUES (?, ?)
            """,
            (datetime.utcnow(), language_id)
        )
        answer_id = cursor.lastrowid
        
        conn.commit()  # 回答挿入後にコミット
        
        # 回答の元言語を登録
        cursor.execute(
            """
            INSERT INTO answer_translation (answer_id, language_id, texts)
            VALUES (?, ?, ?)
            """,
            (answer_id, language_id, request.answer_text)
        )

        conn.commit()  # **元言語の回答を挿入した後にコミット**

        # 各言語に翻訳
        for target_lang_id in languages:
            if target_lang_id == language_id:
                continue  # 🔥 元言語はスキップ（すでにINSERT済み）
            try:
                answer_translate(answer_id, target_lang_id, current_user)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"回答ID {answer_id} の翻訳に失敗しました: {str(e)}")
        
        # QAテーブルに登録
        cursor.execute(
            """
            INSERT INTO QA (question_id, answer_id)
            VALUES (?, ?)
            """,
            (question_id, answer_id)
        )
        
        conn.commit()

        # 📌 通知の先頭メッセージ（言語別）
        new_question_translations = {
            "日本語": "新しい質問が登録されました",
            "English": "New question has been registered",
            "Tiếng Việt": "Câu hỏi mới đã được đăng ký",
            "中文": "新问题已注册",
            "한국어": "새로운 질문이 등록되었습니다"
        }
        # 📌 投稿者（ニックネーム）の表記（言語別）
        by_user_translations = {
            "日本語": "登録者",
            "English": "by",
            "Tiếng Việt": "bởi",
            "中文": "由",
            "한국어": "등록자"
        }

        # 📌 **質問内容のスニペットを通知に追加**
        snippet_length = 50  # スニペットの最大長
        
        # `notifications` に通知を追加（全体通知 + question_id）
        _ensure_notifications_question_id(conn)
        cursor.execute(
            """
            INSERT INTO notifications (user_id, is_read, time, global_read_users, question_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (-1, False, datetime.now(), '[]', question_id)
        )
        notification_id = cursor.lastrowid  # 挿入された通知のID
        conn.commit()

        # 📌 **通知の翻訳を `question_translation` から取得**
        cursor.execute(
            """
            SELECT language_id, texts FROM question_translation WHERE question_id = ?
            """, (question_id,)
        )
        translations = cursor.fetchall()

        # 🔹 各言語のスニペットを `notifications_translation` に格納
        for lang_id, text in translations:
            snippet = text[:snippet_length] + ("..." if len(text) > snippet_length else "")
            # 言語名を取得（"日本語" など）
            lang_name = next(key for key, val in language_mapping.items() if val == lang_id)
            # メッセージ例: "新しい質問が登録されました（登録者: ニックネーム）: スニペット"
            prefix = new_question_translations.get(lang_name, "New question has been registered")
            by_label = by_user_translations.get(lang_name, "by")
            nickname = current_user.get("name", "user")
            translated_message = f"{prefix}（{by_label}: {nickname}）: {snippet}"

            cursor.execute(
                """
                INSERT INTO notifications_translation (notification_id, language_id, messages)
                VALUES (?, ?, ?)
                """,
                (notification_id, lang_id, translated_message),
            )

        conn.commit()  # 翻訳の挿入を確定
        
    return {
        "question_id": question_id,
        "question_text": request.content,
        "answer_id": answer_id,
        "answer_text": request.answer_text,
    }

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
    

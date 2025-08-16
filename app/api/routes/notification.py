import sqlite3
import json
from fastapi import APIRouter, HTTPException, Depends
from config import DATABASE, language_mapping
from api.routes.user import current_user_info
from models.schemas import NotificationRequest

router = APIRouter()

def _ensure_notifications_question_id(conn: sqlite3.Connection):
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(notifications)")
        cols = [row[1] for row in cur.fetchall()]
        if "question_id" not in cols:
            cur.execute("ALTER TABLE notifications ADD COLUMN question_id INTEGER")
            conn.commit()
    except Exception:
        pass

@router.get("/notifications")
def get_notifications(current_user: dict = Depends(current_user_info)):
    user_id = current_user["id"]
    spoken_language = current_user["spoken_language"]

    if user_id is None:
        raise HTTPException(status_code=400, detail="認証情報が取得できません")

    # 言語IDを取得
    language_id = language_mapping.get(spoken_language, 2)  # デフォルトは英語 (2)

    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            _ensure_notifications_question_id(conn)

            # 🔍 指定ユーザーの未読通知を取得（`notifications_translation` から翻訳を取得）
            cursor.execute("""
                SELECT n.id, 
                       COALESCE(nt.messages, (SELECT messages FROM notifications_translation 
                                              WHERE notification_id = n.id AND language_id = 2)) AS message, 
                       n.is_read, 
                       n.time,
                       n.question_id
                FROM notifications n
                LEFT JOIN notifications_translation nt 
                ON n.id = nt.notification_id AND nt.language_id = ?
                WHERE n.user_id = ?
                ORDER BY n.time DESC
            """, (language_id, user_id))
            
            notifications = cursor.fetchall()

            if not notifications:
                return {"notifications": []}  # 通知がない場合は空のリストを返す

            # 🔄 取得した通知を JSON 形式に変換
            result = [
                {
                    "id": row[0],
                    "message": row[1],  # 翻訳されたメッセージ
                    "is_read": bool(row[2]),
                    "time": row[3],
                    "question_id": row[4]
                }
                for row in notifications
            ]

        return {"notifications": result}

    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")

# 既読処理のエンドポイント
@router.put("/notifications/read")
def read_notifications(request: NotificationRequest):
    try:
        with sqlite3 .connect(DATABASE) as conn:
            cursor = conn.cursor()

            # 指定された ID の通知を既読に更新
            cursor.execute(
                "UPDATE notifications SET is_read = 1 WHERE id=?"
                ,(request.id,)
            )
            conn.commit()
        return {"message": "Notifications marked as read"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
   
@router.get("/notifications/global")
def get_notifications_global(current_user: dict = Depends(current_user_info)):
    """
    すべての全体通知を取得するエンドポイント（未読・既読関係なし）。
    ユーザーの言語でメッセージを取得。
    """
    user_id = current_user["id"]
    spoken_language = current_user["spoken_language"]

    if user_id is None:
        raise HTTPException(status_code=400, detail="認証情報が取得できません")

    # 言語IDを取得
    language_id = language_mapping.get(spoken_language, 2)  # デフォルトは英語 (2)

    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    _ensure_notifications_question_id(conn)

    cursor.execute("""
        SELECT n.id, 
               COALESCE(nt.messages, (SELECT messages FROM notifications_translation 
                                      WHERE notification_id = n.id AND language_id = 2)) AS message, 
               n.global_read_users,
               n.time,
               n.question_id
        FROM notifications n
        LEFT JOIN notifications_translation nt 
        ON n.id = nt.notification_id AND nt.language_id = ?
        WHERE n.user_id = -1
    """, (language_id,))
    
    notifications = []
    
    for row in cursor.fetchall():
        notification_id, message, global_read_users, time, question_id = row

        # `NULL` の場合は空のリストに変換
        read_users = json.loads(global_read_users) if global_read_users else []

        notifications.append({
            "id": notification_id,
            "message": message,  # 翻訳されたメッセージ
            "read_users": read_users,  # 既読ユーザーのリストをそのまま渡す
            "time": time,
            "question_id": question_id
        })

    conn.close()
    return notifications


# 📌 全体通知を既読にする
@router.post("/notifications/global/read")
def read_notifications_global(request: NotificationRequest, current_user: dict = Depends(current_user_info)):
    """
    指定された全体通知を、ユーザーが既読にするエンドポイント
    """
    user_id = current_user["id"]
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    # 既存の global_read_users を取得
    cursor.execute("SELECT global_read_users FROM notifications WHERE id = ? AND user_id = -1", (request.id,))
    row = cursor.fetchone()

    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="通知が見つかりません")

    global_read_users = row[0]

    # JSON 文字列をリストに変換
    read_users = json.loads(global_read_users) if global_read_users else []

    # すでに既読ならスキップ
    if user_id in read_users:
        conn.close()
        return {"message": "このユーザーはすでに既読です"}

    # ユーザーIDを追加して更新
    read_users.append(user_id)
    new_global_read_users = json.dumps(read_users)

    cursor.execute("UPDATE notifications SET global_read_users = ? WHERE id = ?", (new_global_read_users, request.id))
    conn.commit()
    conn.close()

    return {"message": f"通知 {request.id} をユーザー {user_id} が既読にしました。"}

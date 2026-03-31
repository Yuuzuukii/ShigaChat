import json
from fastapi import APIRouter, HTTPException, Depends
from config import language_mapping
from database_utils import get_db_cursor, get_placeholder
from api.routers.user import current_user_info
from models.schemas import NotificationRequest

router = APIRouter()

@router.get("/notifications")
async def get_notifications(current_user: dict = Depends(current_user_info)):
    user_id = current_user["id"]
    spoken_language = current_user["spoken_language"]

    if user_id is None:
        raise HTTPException(status_code=400, detail="認証情報が取得できません")

    # 言語IDを取得
    language_id = language_mapping.get(spoken_language, 2)  # デフォルトは英語 (2)

    try:
        
        
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            # 🔍 指定ユーザーの未読通知を取得（`notifications_translation` から翻訳を取得）
            cursor.execute(f"""
                SELECT n.id, 
                       COALESCE(nt.messages, (SELECT messages FROM notifications_translation 
                                              WHERE notification_id = n.id AND language_id = 2)) AS message, 
                       n.is_read, 
                       n.time,
                       n.question_id
                FROM notifications n
                LEFT JOIN notifications_translation nt 
                ON n.id = nt.notification_id AND nt.language_id = {ph}
                WHERE n.user_id = {ph}
                ORDER BY n.time DESC
            """, (language_id, user_id))
            
            notifications = cursor.fetchall()

            if not notifications:
                return {"notifications": []}  # 通知がない場合は空のリストを返す
            result = [
                {
                    "id": row['id'],
                    "message": row['message'],
                    "is_read": bool(row['is_read']),
                    "time": row['time'],
                    "question_id": row['question_id']
                }
                for row in notifications
            ]

        return {"notifications": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")

# 既読処理のエンドポイント
@router.put("/notifications/read")
async def read_notifications(request: NotificationRequest):
    try:
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            # 指定された ID の通知を既読に更新
            cursor.execute(
                f"UPDATE notifications SET is_read = 1 WHERE id = {ph}",
                (request.id,)
            )
            conn.commit()
        return {"message": "Notifications marked as read"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
   
@router.get("/notifications/global")
async def get_notifications_global(current_user: dict = Depends(current_user_info)):
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
    
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(f"""
            SELECT n.id, 
                   COALESCE(nt.messages, (SELECT messages FROM notifications_translation 
                                          WHERE notification_id = n.id AND language_id = 2)) AS message, 
                   n.global_read_users,
                   n.time,
                   n.question_id
            FROM notifications n
            LEFT JOIN notifications_translation nt 
            ON n.id = nt.notification_id AND nt.language_id = {ph}
            WHERE n.user_id = -1 OR n.global_read_users IS NOT NULL
            ORDER BY n.time DESC
        """, (language_id,))
        
        notifications = []
        
        for row in cursor.fetchall():
            notification_id = row['id']
            message = row['message']
            global_read_users = row['global_read_users']
            time = row['time']
            question_id = row['question_id']

            # `NULL` の場合は空のリストに変換
            read_users = json.loads(global_read_users) if global_read_users else []

            notifications.append({
                "id": notification_id,
                "message": message,  # 翻訳されたメッセージ
                "read_users": read_users,  # 既読ユーザーのリストをそのまま渡す
                "time": time,
                "question_id": question_id
            })

    return notifications


# すべての個人通知を既読にする
@router.put("/notifications/read_all")
async def read_all_notifications(current_user: dict = Depends(current_user_info)):
    try:
        user_id = current_user["id"]
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            cursor.execute(
                f"UPDATE notifications SET is_read = 1 WHERE user_id = {ph}",
                (user_id,)
            )
            conn.commit()
        return {"message": "All personal notifications marked as read"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# すべての全体通知を既読にする（現在のユーザーを global_read_users に追加）
@router.post("/notifications/global/read_all")
async def read_all_notifications_global(current_user: dict = Depends(current_user_info)):
    try:
        user_id = current_user["id"]
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            cursor.execute(
                f"""
                SELECT id, COALESCE(global_read_users, '[]') AS global_read_users
                FROM notifications
                WHERE user_id = -1 OR global_read_users IS NOT NULL
                """
            )
            rows = cursor.fetchall() or []

            for row in rows:
                nid = row['id'] if isinstance(row, dict) else row[0]
                gru_raw = row['global_read_users'] if isinstance(row, dict) else row[1]
                try:
                    arr = json.loads(gru_raw) if gru_raw else []
                except Exception:
                    arr = []
                if user_id not in arr:
                    arr.append(user_id)
                    new_val = json.dumps(arr)
                    cursor.execute(
                        f"UPDATE notifications SET global_read_users = {ph} WHERE id = {ph}",
                        (new_val, nid)
                    )
            conn.commit()
        return {"message": "All global notifications marked as read for current user"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 📌 全体通知を既読にする
@router.post("/notifications/global/read")
async def read_notifications_global(request: NotificationRequest, current_user: dict = Depends(current_user_info)):
    """
    指定された全体通知を、ユーザーが既読にするエンドポイント
    """
    user_id = current_user["id"]
    
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        # 既存の global_read_users を取得
        cursor.execute(
            f"SELECT global_read_users FROM notifications WHERE id = {ph} AND (user_id = -1 OR global_read_users IS NOT NULL)",
            (request.id,)
        )
        row = cursor.fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="通知が見つかりません")

        global_read_users = row['global_read_users']

        # JSON 文字列をリストに変換
        read_users = json.loads(global_read_users) if global_read_users else []

        # すでに既読ならスキップ
        if user_id in read_users:
            return {"message": "このユーザーはすでに既読です"}

        # ユーザーIDを追加して更新
        read_users.append(user_id)
        new_global_read_users = json.dumps(read_users)

        cursor.execute(
            f"UPDATE notifications SET global_read_users = {ph} WHERE id = {ph}",
            (new_global_read_users, request.id)
        )
        conn.commit()

    return {"message": f"通知 {request.id} をユーザー {user_id} が既読にしました。"}

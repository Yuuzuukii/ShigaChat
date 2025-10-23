from datetime import datetime
from jose import jwt, JWTError
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from api.utils.security import ALGORITHM, hash_password, verify_password, create_access_token, oauth2_scheme
from models.schemas import User, UserLogin
from config import SECRET_KEY
from database_utils import get_db_cursor, get_placeholder

router = APIRouter()

# /register エンドポイントの作成
@router.post("/register")
async def register_user(user: User):
    # ニックネームの重複を確認
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(f"SELECT id FROM user WHERE name = {ph}", (user.name,))
        existing_user = cursor.fetchone()

    if existing_user:
        raise HTTPException(status_code=400, detail="この名前は既に使用されています")
    
    # パスワードをハッシュ化して保存
    hashed_password = hash_password(user.password)
    with get_db_cursor() as (cursor, conn):
        cursor.execute(f"""
        INSERT INTO user (name, password, spoken_language)
        VALUES ({ph}, {ph}, {ph})
        """, (user.name, hashed_password, user.spoken_language))
        conn.commit()

    return {"message": "登録が完了しました"}

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token: User ID missing")
        
        # 有効期限 (exp) の検証
        exp = payload.get("exp")
        if exp and datetime.fromtimestamp(exp) < datetime.utcnow():
            raise HTTPException(status_code=401, detail="Token has expired")
        
        return {"id": user_id}
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid token") from e


@router.get("/current_user")
async def current_user_info(current_user: dict = Depends(get_current_user)):
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(f"SELECT * FROM user WHERE id = {ph}", (current_user["id"],))
        user = cursor.fetchone()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user['id'],
        "name": user['name'],
        "spoken_language": user.get('spoken_language', 'English'),
    }

@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends()
):
    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(f"SELECT id, password, spoken_language FROM user WHERE name = {ph}", (form_data.username,))
        db_user = cursor.fetchone()

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = db_user['id']
    stored_password = db_user['password']
    spoken_language = db_user.get('spoken_language', 'English')

    if not verify_password(form_data.password, stored_password):
        raise HTTPException(status_code=401, detail="Incorrect password")

    # JWT に必要な情報のみ含める
    access_token = create_access_token(
        data={"id": user_id, "spoken_language": spoken_language}
    )

    return {"access_token": access_token, "token_type": "bearer"}


# /user_delete エンドポイントを追加
@router.delete("/user_delete")
async def delete_user(user: UserLogin, current_user: str = Depends(get_current_user)):
    if current_user != user.name:
        raise HTTPException(status_code=403, detail="Permission denied")

    ph = get_placeholder()
    with get_db_cursor() as (cursor, conn):
        cursor.execute(f"SELECT password FROM user WHERE name = {ph}", (user.name,))
        db_user = cursor.fetchone()

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
  
    stored_password = db_user['password']

    # パスワードの照合
    if not verify_password(user.password, stored_password):
        raise HTTPException(status_code=401, detail="Incorrect password")
    
    # ユーザーを削除
    try:
        with get_db_cursor() as (cursor, conn):
            cursor.execute(f"DELETE FROM user WHERE name = {ph}", (user.name,))
            conn.commit()
    except Exception:
        raise HTTPException(status_code=500, detail="データベースエラーが発生しました")

    return {"message": "ユーザー情報が削除されました"}

@router.post("/change_language")
async def change_language(language: str, token: str = Depends(oauth2_scheme)):
    try:
        # トークンをデコードしてユーザー情報を取得
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        # データベースを更新
        ph = get_placeholder()
        with get_db_cursor() as (cursor, conn):
            cursor.execute(f"UPDATE user SET spoken_language = {ph} WHERE id = {ph}", (language, user_id))
            conn.commit()

        # 新しいトークンを発行
        access_token = create_access_token(data={"id": user_id, "spoken_language": language})
        return {"message": "Language updated successfully", "access_token": access_token}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    

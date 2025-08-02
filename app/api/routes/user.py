import sqlite3
from datetime import datetime
from jose import jwt, JWTError
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from api.utils.security import ALGORITHM, hash_password, verify_password, create_access_token, oauth2_scheme
from models.schemas import User, UserLogin
from config import DATABASE, SECRET_KEY

router = APIRouter()

# /register エンドポイントの作成
@router.post("/register")
def register_user(user: User):
    # ニックネームの重複を確認
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM user WHERE nickname = ?", (user.nickname,))
        existing_user = cursor.fetchone()

    if existing_user:
        raise HTTPException(status_code=400, detail="このニックネームは既に使用されています")
    
    # パスワードをハッシュ化して保存
    hashed_password = hash_password(user.password)
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO user (nickname, password, spoken_language, gender, age)
        VALUES (?, ?, ?, ?, ?)
        """, (user.nickname, hashed_password, user.spoken_language, user.gender, user.age))
        conn.commit()

    return {"message": "登録が完了しました"}

def get_current_user(token: str = Depends(oauth2_scheme)):
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
def current_user_info(current_user: dict = Depends(get_current_user)):
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM user WHERE id = ?", (current_user["id"],))
        user = cursor.fetchone()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user[0],
        "nickname": user[1],
        "spoken_language": user[3],
        "gender": user[4],
        "age": user[5],
        "isAdmin": user[6],  # is_admin を追加
    }

@router.post("/token")
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends()
):
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, password, spoken_language, is_admin FROM user WHERE nickname = ?", (form_data.username,))
        db_user = cursor.fetchone()

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user_id, stored_password, spoken_language, is_admin = db_user
    
    print(f"User ID: {user_id}, Spoken Language: {spoken_language}, Is Admin: {is_admin}")

    if not verify_password(form_data.password, stored_password):
        raise HTTPException(status_code=401, detail="Incorrect password")

    # JWT に isAdmin を含める
    access_token = create_access_token(
        data={"id": user_id, "spoken_language": spoken_language, "isAdmin": is_admin}
    )

    return {"access_token": access_token, "token_type": "bearer"}

# /user_delete エンドポイントを追加
@router.delete("/user_delete")
def delete_user(user: UserLogin, current_user: str = Depends(get_current_user)):
    if current_user != user.nickname:
        raise HTTPException(status_code=403, detail="Permission denied")

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password FROM user WHERE nickname = ?", (user.nickname,))
        db_user = cursor.fetchone()

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    stored_password = db_user[0]

    # パスワードの照合
    if not verify_password(user.password, stored_password):
        raise HTTPException(status_code=401, detail="Incorrect password")
    
    # ユーザーを削除
    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM user WHERE nickname = ?", (user.nickname,))
            conn.commit()
    except sqlite3.Error:
        raise HTTPException(status_code=500, detail="データベースエラーが発生しました")

    return {"message": "ユーザー情報が削除されました"}

@router.post("/change_language")
def change_language(language: str, token: str = Depends(oauth2_scheme)):
    try:
        # トークンをデコードしてユーザー情報を取得
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        # データベースを更新
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE user SET spoken_language = ? WHERE id = ?", (language, user_id))
            conn.commit()

        # 新しいトークンを発行
        access_token = create_access_token(data={"id": user_id, "spoken_language": language})
        return {"message": "Language updated successfully", "access_token": access_token}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from api.routes import user, question, category, keyword, notification, history, admin

logging.basicConfig(level=logging.DEBUG)

app= FastAPI()

# 🚨 CORS の設定（必ず FastAPIインスタンスに対して）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000","http://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user.router, prefix="/user")
app.include_router(question.router, prefix="/question")
app.include_router(category.router, prefix="/category")
app.include_router(keyword.router, prefix="/keyword")
app.include_router(notification.router, prefix="/notification")
app.include_router(history.router, prefix="/history")
app.include_router(admin.router, prefix="/admin")


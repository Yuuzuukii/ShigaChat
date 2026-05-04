from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from controllers.conversation import chat_controller
from controllers.identity import user_controller
from controllers.knowledge import category_controller
from controllers.retrieval import retrieval_controller

app = FastAPI(title="ShigaChat Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user_controller.router, prefix="/user")
app.include_router(chat_controller.router, prefix="/question")
app.include_router(category_controller.router, prefix="/category")
app.include_router(retrieval_controller.router, prefix="/retrieval")


@app.get("/")
async def health():
    return {"status": "ok"}

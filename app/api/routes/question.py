# データベースの中身を見たい時、uwsgiコンテナの中（exec）で以下を実行
"""
apt-get update
apt-get install -y sqlite3
sqlite3 ShigaChat.db
"""

import os
import sqlite3
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from langdetect import detect
from langdetect.lang_detect_exception import LangDetectException
from config import DATABASE, OPENAI_API_KEY, language_mapping
from api.routes.user import current_user_info
from api.routes.category import categorize_question
from models.schemas import SimpleQuestion, QuestionRequest, Question, AnswerRequest
from api.utils.security import detect_privacy_info
from api.utils.translator import question_translate, answer_translate
from api.utils.RAG import rag, generate_answer_with_llm


router = APIRouter()

@router.post("/post_question")
def post_question(
    question: SimpleQuestion,
    current_user: dict = Depends(current_user_info)
):
    user_id = current_user["id"]
    question_time = datetime.now()
    
    # 質問文のプライバシー情報検出
    detected_pii = detect_privacy_info(question.content)
    if detected_pii:
        # 検出されたプライバシー情報をエラーメッセージに含める
        detail_message = ", ".join([f"{pii_type}: {match}" for pii_type, match in detected_pii])
        raise HTTPException(
            status_code=400,
            detail=f"質問文にプライバシーに関わる情報が含まれています: {detail_message}"
        )

    # 質問文の言語を検出
    try:
        detected_language = detect(question.content).upper()
    except LangDetectException:
        raise HTTPException(status_code=400, detail="質問文から言語を特定できませんでした")

    # 検出された言語コードからlanguage_idを取得
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM language WHERE code = ?", (detected_language,))
        language_id_row = cursor.fetchone()
        if not language_id_row:
            raise HTTPException(status_code=404, detail="検出された言語に対応する言語IDが見つかりません")
        language_id = language_id_row[0]
    
    # カテゴリを判定
    try:
        category_id, category_name = categorize_question(question.content, language_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"カテゴリ分けのエラー: {str(e)}")

    # 質問をデータベースに保存
    with sqlite3.connect(DATABASE) as conn:
        try:
            cursor = conn.cursor()

            # `question`テーブルに保存
            cursor.execute("""
                INSERT INTO question (category_id, time, language_id, user_id, title, content, public)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (category_id, question_time, language_id, user_id, "ユーザー質問", question.content, question.public))
            conn.commit()

            # 新しく挿入された質問のquestion_idを取得
            cursor.execute("SELECT last_insert_rowid()")
            question_id = cursor.fetchone()[0]

            # `question_translation`テーブルに元言語の質問を保存
            cursor.execute("""
                INSERT INTO question_translation (question_id, language_id, texts)
                VALUES (?, ?, ?)
            """, (question_id, language_id, question.content))
            conn.commit()

        except sqlite3.Error as e:
            raise HTTPException(status_code=500, detail=f"データベースエラーが発生しました: {str(e)}")

    # 翻訳対象の言語リストを取得
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM language WHERE id != ?", (language_id,))
        target_language_ids = [row[0] for row in cursor.fetchall()]

    # 各言語に翻訳を保存
    for target_language_id in target_language_ids:
        question_translate(question_id, target_language_id, current_user)

    return {
        "message": "質問が正常に投稿され、翻訳が保存されました",
        "question_id": question_id,
        "category": category_name
    }

@router.get("/get_translated_question")
def get_translated_question(question_id: int, language_id: int, current_user: dict = Depends(current_user_info)):
    """
    翻訳済みの質問を取得する
    """
    print(f"リクエストデータ: question_id={question_id}, language_id={language_id}")  # デバッグログ

    # ユーザの言語情報を取得
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)

    if not language_id:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported spoken language: {spoken_language}"
        )

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # 翻訳済みの質問を取得
        cursor.execute("""
            SELECT texts FROM question_translation
            WHERE question_id = ? AND language_id = ?
        """, (question_id, language_id))
        translated_question = cursor.fetchone()

        if not translated_question:
            raise HTTPException(
                status_code=404,
                detail="指定された言語で翻訳済み質問が見つかりません"
            )

        return {"text": translated_question[0]}

def load_data_from_database():
    if not os.path.exists(DATABASE):
        raise FileNotFoundError(f"Database not found: {DATABASE}")

    questions_and_answers = []
    
    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("""SELECT question_translation.question_id, texts FROM question_translation 
                JOIN question ON question_translation.question_id=question.question_id 
                WHERE question.title="official" AND
                question_translation.language_id=1 AND
                question.public=1""")
            questions = cursor.fetchall()

            
            cursor.execute("SELECT texts FROM answer_translation WHERE language_id=1")
            answers = cursor.fetchall()
            
            if not questions:
                print("⚠️ No questions found in `question_translation` table")
            if not answers:
                print("⚠️ No answers found in `answer_translation` table")

            questions_and_answers = []
            for (question_id, question_text), (answer_text,) in zip(questions, answers):
                questions_and_answers.append((question_id, f"Q: {question_text}\nA: {answer_text}"))

        print(f"✅ データベースから取得した Q&A の数: {len(questions_and_answers)}")

    except sqlite3.Error as e:
        print(f"❌ データベースの読み込みエラー: {str(e)}")
    
    return questions_and_answers

@router.post("/get_answer")
async def get_answer(request: Question, current_user: dict = Depends(current_user_info)):
    question_text = request.text
    thread_id = request.thread_id
    user_id = current_user[""]

    try:
        # スレッドが存在しなければ作成
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT thread_id FROM threads WHERE thread_id = ?", (thread_id,))
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO threads (thread_id, user_id, last_updated) VALUES (?, ?, ?)",
                    (thread_id, user_id, datetime.now())
                )
                conn.commit()

        # rag_result = {1: [answer, question, time, distance], ...}
        rag_result = rag(question_text)

        rag_qa = []
        for rank in sorted(rag_result.keys()):
            answer, question, retrieved_at, distance = rag_result[rank]
            score = round(1 / (1 + distance), 4)  # スコア化
            rag_qa.append({
                "question": question,
                "answer": answer,
                "retrieved_at": retrieved_at,
                "score": score
            })


        # 🔹 thread_qaから直近5件の対話履歴を取得
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT question, answer FROM thread_qa
                WHERE thread_id = ?
                ORDER BY created_at DESC
                LIMIT 5
            """, (thread_id,))
            past_qa_rows = cursor.fetchall()
        history_qa = list(reversed(past_qa_rows))  # 時系列順に並び替え

        # 🔹 LLMで回答生成
        generated_answer = generate_answer_with_llm(
            question_text=question_text,
            rag_qa=rag_qa,
            history_qa=history_qa
        )

        # 🔹 新しいQAペアを保存
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO thread_qa (thread_id, question, answer)
                VALUES (?, ?, ?)
            """, (thread_id, question_text, generated_answer))
            cursor.execute("""
                UPDATE threads SET last_updated = ? WHERE thread_id = ?
            """, (datetime.now(), thread_id))
            conn.commit()

        return {
            "answer": generated_answer,
            "rag_qa": rag_qa
        }

    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DBエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部エラー: {str(e)}")



"""
@router.post("/get_answer")
async def get_answer(request: Question, current_user: dict = Depends(current_user_info)):
    question_text = request.text

    try:
        # 🔹 質問情報を取得
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("
                SELECT q.content, c.description AS category_name, q.title, q.time
                FROM question q
                LEFT JOIN category c ON q.category_id = c.id
                WHERE q.question_id = ? 
            ", (question_id,))
            question_data = cursor.fetchone()

        if not question_data:
            raise HTTPException(status_code=404, detail="質問が見つかりません")

        question_content, category_name, question_title, question_time = question_data

        # 🔹 `question_time` を datetime に変換
        if question_time:
            try:
                question_time = datetime.strptime(question_time, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                question_time = datetime.strptime(question_time, "%Y-%m-%d %H:%M:%S.%f")

        # 🔹 `QA` テーブルから `answer_id` を取得
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT answer_id FROM QA WHERE question_id = ?", (question_id,))
            answer_id_row = cursor.fetchone()

        answer_id = answer_id_row[0] if answer_id_row else None

        # 🔹 RAG をセットアップ
        data = load_data_from_database()
        chunks = split_data_into_chunks(data)
        vector_store = build_faiss_index(chunks)
        rag_chain = setup_rag_chain(vector_store)

        # 🔹 RAG で関連ドキュメントを取得
        result = rag_chain({"query": question_content})
        source_documents = result["source_documents"]

        if not source_documents:
            raise HTTPException(status_code=404, detail="関連する質問が見つかりません")

        # 🔹 `answer_id` が存在しない場合、新しい回答を生成
        if not answer_id:
            print(f"質問 {question_id} に対応する回答がないため、新規作成します")

            # RAG から最も関連のある `QA` を抽出
            context = "\n".join([doc.page_content for doc in source_documents])

            # LLM を使用して回答を生成
            prompt = f"
            あなたは滋賀県に住む外国人向けの専門家です。
            以下の参考情報を元に、ユーザーの質問に適切に回答してください。

            【参考情報】
            {context}

            【質問】
            {question_content}

            【回答】
            "

            llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0, openai_api_key=OPENAI_API_KEY)
            response = llm.invoke(prompt)
            generated_answer_text = response.content.strip()

            # 🔹 `answer` をデータベースに保存
            with sqlite3.connect(DATABASE) as conn:
                cursor = conn.cursor()
                cursor.execute("INSERT INTO answer (language_id, time) VALUES (?, ?)", (language_id, datetime.now()))
                conn.commit()
                answer_id = cursor.lastrowid  # `answer_id` は `AUTO_INCREMENT`

                # 🔹 `QA` に `question_id` と `answer_id` を登録
                cursor.execute("INSERT INTO QA (question_id, answer_id) VALUES (?, ?)", (question_id, answer_id))

                # 🔹 `answer_translation` に元の言語の回答を保存
                cursor.execute("INSERT INTO answer_translation (answer_id, language_id, texts) VALUES (?, ?, ?)",
                               (answer_id, language_id, generated_answer_text))
                conn.commit()

            print(f"新しい回答が作成されました: answer_id={answer_id}")

        # 🔹 `answer_translation` に全5言語があるか確認し、不足分を翻訳
        required_languages = [1, 2, 3, 4, 5]  # JA, EN, VI, ZH, KO
        existing_languages = set()

        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("
                SELECT language_id FROM answer_translation WHERE answer_id = ?
            ", (answer_id,))
            existing_languages = {row[0] for row in cursor.fetchall()}

        missing_languages = set(required_languages) - existing_languages

        # 🔹 不足している言語を翻訳して格納
        for missing_language in missing_languages:
            print(f"翻訳が存在しないため、answer_translate を実行: answer_id={answer_id}, language_id={missing_language}")
            translation_response = answer_translate(answer_id, missing_language, current_user)

        # 🔹 `answer_translation` からすべての翻訳データを取得
        all_translations = {}

        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("
                SELECT language_id, texts FROM answer_translation WHERE answer_id = ?
            ", (answer_id,))
            for row in cursor.fetchall():
                all_translations[row[0]] = row[1]  # {language_id: translation}
        answer = all_translations.get(language_id, "回答が見つかりません")

        # 🔹 `source_documents` を `question_id` ベースのデータに変換
        formatted_source_documents = []
        for doc in source_documents:
            doc_question_id = doc.metadata.get("question_id", "unknown")

            with sqlite3.connect(DATABASE) as conn:
                cursor = conn.cursor()
                cursor.execute("
                    SELECT q.content, c.description AS category_name, q.title, q.time, qa.answer_id, at.texts
                    FROM question q
                    LEFT JOIN category c ON q.category_id = c.id
                    LEFT JOIN QA qa ON q.question_id = qa.question_id
                    LEFT JOIN answer_translation at ON qa.answer_id = at.answer_id AND at.language_id = ?
                    WHERE q.question_id = ?
                ", (language_id, doc_question_id))
                doc_data = cursor.fetchone()

            if doc_data:
                doc_content, doc_category, doc_title, doc_time, doc_answer_id, doc_answer_text = doc_data

                if doc_time:
                    try:
                        doc_time = datetime.strptime(doc_time, "%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        doc_time = datetime.strptime(doc_time, "%Y-%m-%d %H:%M:%S.%f")

                formatted_source_documents.append({
                    "question_id": doc_question_id,
                    "content": doc_content,
                    "answer_id": doc_answer_id if doc_answer_id else None,
                    "answer": doc_answer_text if doc_answer_text else "回答が見つかりません",
                    "time": doc_time.isoformat() if doc_time else "日時不明",
                    "title": doc_title or "不明なタイトル"
                })

        return {
            "question_id": question_id,
            "content": question_content,
            "answer_id": answer_id,
            "answer": answer,
            "time": question_time.isoformat() if question_time else "日時不明",
            "title": question_title,
            "source_documents": formatted_source_documents
        }

    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"データベースエラー: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")
"""

@router.get("/get_translated_answer")
def get_translated_answer(
    answer_id: int = Query(..., description="Answer ID"),
    current_user: dict = Depends(current_user_info)
):
    """
    翻訳済みの回答を取得する
    ユーザの言語情報を基に language_id を設定
    """
    spoken_language = current_user["spoken_language"]
    language_id = language_mapping.get(spoken_language)

    if not language_id:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported spoken language: {spoken_language}"
        )

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT texts FROM answer_translation
            WHERE answer_id = ? AND language_id = ?
        """, (answer_id, language_id))
        translated_answer = cursor.fetchone()

        if not translated_answer:
            raise HTTPException(
                status_code=404,
                detail="指定された言語で翻訳済み回答が見つかりません"
            )

        return {"text": translated_answer[0]}

# 各translationテーブルに９言語分のQAを入れるコード

# import sqlite3
# import time
# import requests
# from bs4 import BeautifulSoup

# # ===== 設定 =====
# DB_PATH   = "NewShigaChat.db"
# BASE      = "https://www.s-i-a.or.jp"
# FIXED_DT  = "2025-09-22 00:00:00"
# UA        = {"User-Agent": "ShigaChatCrawler/1.0 (+https://example.com)"}
# SLEEP_SEC = 0.7   # サイトに優しく

# # 言語（code, lang_id, path_prefix）
# LANGS = [
#     ("ja",    1, ""),       # 日本語（正準）
#     ("en",    2, "/en"),
#     ("vi",    3, "/vi"),
#     ("zh-cn", 4, "/zh-cn"),
#     ("ko",    5, "/ko"),
#     ("pt",    6, "/pt"),
#     ("es",    7, "/es"),
#     ("tl",    8, "/tl"),
#     ("id",    9, "/id"),
# ]

# # カテゴリID → スラッグ
# CATEGORY_SLUGS = {
#     1: "immigration_residency_procedures",
#     2: "daily_living",
#     3: "medical_care",
#     4: "pension_insurance",
#     5: "labor",
#     6: "education",
#     7: "marriage_divorce",
#     8: "childbirth_childcare",
#     9: "housing",
#     10: "tax",
#     11: "welfare",
#     12: "incidents_accidents",
#     13: "disaster",
# }

# # ===== DBユーティリティ =====
# def ensure_user(cur):
#     cur.execute("SELECT id FROM user WHERE name=?", ("sia",))
#     row = cur.fetchone()
#     if row:
#         return row[0]
#     cur.execute("INSERT INTO user (name, password) VALUES (?, ?)", ("sia", "sia"))
#     return cur.lastrowid

# def insert_question(cur, category_id, user_id):
#     cur.execute("""
#         INSERT INTO question (category_id, time, language_id, user_id, title, content, public)
#         VALUES (?, ?, ?, ?, ?, ?, 1)
#     """, (category_id, FIXED_DT, 1, user_id, "Untitled", "No content"))
#     return cur.lastrowid

# def insert_answer(cur, lang_id):
#     cur.execute("INSERT INTO answer (time, language_id) VALUES (?, ?)", (FIXED_DT, lang_id))
#     return cur.lastrowid

# def link_QA(cur, qid, aid):
#     cur.execute("INSERT INTO QA (question_id, answer_id) VALUES (?, ?)", (qid, aid))


# def insert_q_trans(cur, qid, lang_id, text):
#     cur.execute("""
#         INSERT INTO question_translation (question_id, language_id, texts, checked)
#         VALUES (?, ?, ?, 1)
#     """, (qid, lang_id, text or ""))

# def insert_a_trans(cur, aid, lang_id, html_text):
#     cur.execute("""
#         INSERT INTO answer_translation (answer_id, language_id, texts, checked)
#         VALUES (?, ?, ?, 1)
#     """, (aid, lang_id, html_text or ""))

# # ===== 取得・解析 =====
# def fetch_soup(url):
#     r = requests.get(url, headers=UA, timeout=30)
#     r.raise_for_status()
#     return BeautifulSoup(r.text, "html.parser")

# def extract_pairs(soup):
#     """各 paragraph--type--consulting-qa から (Q_text, A_html) の配列を返す"""
#     pairs = []
#     for blk in soup.select(".paragraph--type--consulting-qa"):
#         q = blk.select_one(".field--name-field-question .field__item")
#         a = blk.select_one(".field--name-field-answer  .field__item")
#         if not (q and a):
#             continue
#         q_text = q.get_text(" ", strip=True)
#         a_html = a.decode_contents()  # 見出し/リンク保持
#         pairs.append((q_text, a_html))
#     return pairs

# def load_category_all_lang(slug):
#     """1カテゴリの全言語ページを1回ずつ取得して辞書で返す: {lang_id: [(Q, A_html), ...]}"""
#     result = {}
#     for code, lang_id, prefix in LANGS:
#         url = f"{BASE}{prefix}/qa/{slug}" if code != "ja" else f"{BASE}/qa/{slug}"
#         print("GET", url)
#         try:
#             soup = fetch_soup(url)
#             pairs = extract_pairs(soup)
#             result[lang_id] = pairs
#         except Exception as e:
#             print(f"  !! fetch error ({code}): {e}")
#             result[lang_id] = []
#         time.sleep(SLEEP_SEC)
#     return result

# # ===== メイン処理 =====
# def main():
#     conn = sqlite3.connect(DB_PATH)
#     cur = conn.cursor()
#     user_id = ensure_user(cur)

#     for category_id, slug in CATEGORY_SLUGS.items():
#         print(f"\n==== Category {category_id}: {slug} ====")
#         by_lang = load_category_all_lang(slug)

#         base = by_lang.get(1, [])  # 日本語を正準
#         if not base:
#             print("  !! 日本語ページでQ/Aが見つかりません。スキップ")
#             continue

#         # 各Q/A（日本語の件数に合わせる）
#         for idx, (q_ja, a_ja) in enumerate(base, start=1):
#             # 1) question（JA基準で1件作成）
#             qid = insert_question(cur, category_id, user_id)

#             # 2) 各言語の回答(answer) と翻訳(question_translation, answer_translation)
#             for code, lang_id, _ in LANGS:
#                 # 言語ごとの(Q, A)取得（無ければ空文字）
#                 q_text = ""
#                 a_html = ""
#                 pairs = by_lang.get(lang_id, [])
#                 if idx - 1 < len(pairs):
#                     q_text, a_html = pairs[idx - 1]

#                 # 質問翻訳
#                 insert_q_trans(cur, qid, lang_id, q_text)

#                 # 回答本体 + 回答翻訳
#                 aid = insert_answer(cur, lang_id)
#                 insert_a_trans(cur, aid, lang_id, a_html)

#                 # QAリンク
#                 link_QA(cur, qid, aid)

#             if idx % 5 == 0:
#                 conn.commit()
#                 print(f"  ... inserted {idx} QAs")

#         conn.commit()
#         print(f"✅ Category {category_id} done: {len(base)} base QAs")

#     conn.close()
#     print("\n🎉 All done.")

# if __name__ == "__main__":
#     main()

#Question tableにcontentを入れるコード
import requests
from bs4 import BeautifulSoup
import sqlite3
from datetime import datetime

DB_PATH = "NewShigaChat.db"
BASE_URL = "https://www.s-i-a.or.jp/qa"

# カテゴリID → スラッグ（日本語ページのみ使用）
CATEGORIES = {
    1: "immigration_residency_procedures",
    2: "daily_living",
    3: "medical_care",
    4: "pension_insurance",
    5: "labor",
    6: "education",
    7: "marriage_divorce",
    8: "childbirth_childcare",
    9: "housing",
    10: "tax",
    11: "welfare",
    12: "incidents_accidents",
    13: "disaster",
}

FIXED_DATE = "2025-09-22 00:00:00"
EDITOR_ID = 1

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ShigaChatScraper/1.0; +https://example.com)"
}

def fetch_questions_ja(url: str):
    """日本語ページから質問文だけを抽出"""
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    # 正式な構造：質問は .field--name-field-question .field__item
    nodes = soup.select(".field--name-field-question .field__item")
    questions = []
    for n in nodes:
        text = n.get_text(separator=" ", strip=True)
        if text:
            questions.append(text)
    return questions

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    total_updated = 0

    for cat_id, slug in CATEGORIES.items():
        url = f"{BASE_URL}/{slug}"
        print(f"==== Category {cat_id}: {slug} ====")

        questions = fetch_questions_ja(url)
        print(f"  scraped {len(questions)} question(s)")

        if not questions:
            print("  ⚠ 質問が取得できませんでした（セレクタ変更の可能性）")
            continue

        # DB側：このカテゴリの question_id を昇順で取得
        cur.execute(
            "SELECT question_id FROM question WHERE category_id=? ORDER BY question_id ASC",
            (cat_id,),
        )
        qids = [row[0] for row in cur.fetchall()]

        if not qids:
            print("  ⚠ このカテゴリの question 行がDBにありません。先に question を作成してください。")
            continue

        # 取得数に合わせて更新（不足分/超過分は警告）
        n_update = min(len(questions), len(qids))
        if len(questions) != len(qids):
            print(f"  ℹ 件数差あり：scraped={len(questions)}, db_rows={len(qids)} → {n_update}件だけ更新します")

        for i in range(n_update):
            qid = qids[i]
            q_text = questions[i]
            cur.execute(
                """
                UPDATE question
                   SET content = ?, last_editor_id = ?, last_edited_at = ?
                 WHERE question_id = ?
                """,
                (q_text, EDITOR_ID, FIXED_DATE, qid),
            )

        conn.commit()
        total_updated += n_update
        print(f"  ✅ updated {n_update} row(s) for category {cat_id}")

    conn.close()
    print(f"\n🎉 Done. Total updated rows: {total_updated}")

if __name__ == "__main__":
    main()

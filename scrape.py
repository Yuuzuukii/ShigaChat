# 各translationテーブルに９言語分のQAを入れるコード（全削除→再投入つき）
import sqlite3
import time
import requests
from bs4 import BeautifulSoup
import re

# ===== 設定 =====
DB_PATH   = "ShigaChat.db"   # 例: "app/ShigaChat.db" ならここを変更
BASE      = "https://www.s-i-a.or.jp"
FIXED_DT  = "2025-09-22 00:00:00"
UA        = {"User-Agent": "ShigaChatCrawler/1.0 (+https://example.com)"}
SLEEP_SEC = 0.7   # サイトに優しく

# 言語（code, lang_id, path_prefix）
LANGS = [
    ("ja",    1, ""),       # 日本語（正準）
    ("en",    2, "/en"),
    ("vi",    3, "/vi"),
    ("zh-cn", 4, "/zh-cn"),
    ("ko",    5, "/ko"),
    ("pt",    6, "/pt"),
    ("es",    7, "/es"),
    ("tl",    8, "/tl"),
    ("id",    9, "/id"),
]

# カテゴリID → スラッグ
CATEGORY_SLUGS = {
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

# ===== 整形：HTML→自然文（URL保持） =====
async def html_to_plaintext(html: str) -> str:
    """
    回答HTMLを自然文テキストに整形。
    - <a> は「テキスト (URL)」
    - <ol>/<ul> は番号/箇条書き
    - <dl> は「用語：説明」
    - 見出しはタグ除去して1行テキスト化
    - <p>, <br> は改行
    """
    if not html:
        return ""

    soup = BeautifulSoup(html, "html.parser")

    # 不要タグ除去
    for bad in soup(["script", "style"]):
        bad.decompose()

    # aタグ => "テキスト (URL)"
    for a in soup.find_all("a"):
        txt = a.get_text(" ", strip=True)
        href = (a.get("href") or "").strip()
        a.replace_with(f"{txt} ({href})" if href else txt)

    # dl => 「用語：説明」
    for dl in soup.find_all("dl"):
        lines, term = [], None
        for child in dl.children:
            name = getattr(child, "name", None)
            if name == "dt":
                term = child.get_text(" ", strip=True)
            elif name == "dd":
                desc = child.get_text(" ", strip=True)
                if term:
                    lines.append(f"{term}：{desc}")
                    term = None
        dl.replace_with("\n".join(lines))

    # ol/ul => 行に展開
    for lst in soup.find_all(["ol", "ul"]):
        items = []
        for i, li in enumerate(lst.find_all("li", recursive=False), start=1):
            txt = li.get_text(" ", strip=True)
            if not txt:
                continue
            items.append(f"{i}. {txt}" if lst.name == "ol" else f"- {txt}")
        lst.replace_with("\n".join(items))

    # 見出し
    for h in soup.find_all(["h1","h2","h3","h4","h5","h6"]):
        txt = h.get_text(" ", strip=True)
        h.replace_with(txt + "\n")

    # 改行系
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for p in soup.find_all("p"):
        p.replace_with(p.get_text(" ", strip=True) + "\n")

    text = soup.get_text("\n", strip=True)

    # 余分な改行・空白
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)

    return text.strip()

# ===== DBユーティリティ =====
async def wipe_seed_tables(conn):
    """
    既存の投入済みデータ(question/answer/translation/QA)を一括削除し、
    AUTOINCREMENTの採番もリセットする。
    """
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys=OFF;")
    cur.execute("BEGIN;")
    try:
        # 依存の弱い順に削除
        cur.execute("DELETE FROM QA;")
        cur.execute("DELETE FROM question_translation;")
        cur.execute("DELETE FROM answer_translation;")
        cur.execute("DELETE FROM question;")
        cur.execute("DELETE FROM answer;")

        # 採番リセット（存在するテーブルだけ対象になるので安全）
        cur.execute("""
            DELETE FROM sqlite_sequence
             WHERE name IN ('QA','question_translation','answer_translation','question','answer');
        """)

        cur.execute("COMMIT;")
    except Exception:
        cur.execute("ROLLBACK;")
        raise
    finally:
        cur.execute("PRAGMA foreign_keys=ON;")

async def ensure_user(cur):
    cur.execute("SELECT id FROM user WHERE name=?", ("sia",))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute("INSERT INTO user (name, password) VALUES (?, ?)", ("sia", "sia"))
    return cur.lastrowid

async def insert_question(cur, category_id, user_id):
    cur.execute("""
        INSERT INTO question (category_id, time, language_id, user_id, title, content, public)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    """, (category_id, FIXED_DT, 1, user_id, "Untitled", "No content"))
    return cur.lastrowid

# AnswerはQごとに1件だけ作成（language_idはJA=1で固定）
async def insert_answer(cur):
    cur.execute("INSERT INTO answer (time, language_id) VALUES (?, ?)", (FIXED_DT, 1))
    return cur.lastrowid

async def link_QA(cur, qid, aid):
    cur.execute("INSERT INTO QA (question_id, answer_id) VALUES (?, ?)", (qid, aid))

async def insert_q_trans(cur, qid, lang_id, text):
    cur.execute("""
        INSERT INTO question_translation (question_id, language_id, texts, checked)
        VALUES (?, ?, ?, 1)
    """, (qid, lang_id, text or ""))

async def insert_a_trans(cur, aid, lang_id, text_plain):
    cur.execute("""
        INSERT INTO answer_translation (answer_id, language_id, texts, checked)
        VALUES (?, ?, ?, 1)
    """, (aid, lang_id, text_plain or ""))

# ===== 取得・解析 =====
async def fetch_soup(url):
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")

async def extract_pairs(soup):
    """各 paragraph--type--consulting-qa から (Q_text, A_html) の配列を返す"""
    pairs = []
    for blk in soup.select(".paragraph--type--consulting-qa"):
        q = blk.select_one(".field--name-field-question .field__item")
        a = blk.select_one(".field--name-field-answer  .field__item")
        if not (q and a):
            continue
        q_text = q.get_text(" ", strip=True)
        a_html = a.decode_contents()  # 見出し/リンク保持
        pairs.append((q_text, a_html))
    return pairs

async def load_category_all_lang(slug):
    """1カテゴリの全言語ページを1回ずつ取得して辞書で返す: {lang_id: [(Q, A_html), ...]}"""
    result = {}
    for code, lang_id, prefix in LANGS:
        url = f"{BASE}{prefix}/qa/{slug}" if code != "ja" else f"{BASE}/qa/{slug}"
        print("GET", url)
        try:
            soup = fetch_soup(url)
            pairs = extract_pairs(soup)
            result[lang_id] = pairs
        except Exception as e:
            print(f"  !! fetch error ({code}): {e}")
            result[lang_id] = []
        time.sleep(SLEEP_SEC)
    return result

# ===== メイン処理 =====
async def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # ★ 1) 既存データのクリア
    print("Wiping existing QA/translation data...")
    wipe_seed_tables(conn)

    # ★ 2) user レコードの確保
    user_id = ensure_user(cur)

    # ★ 3) 収集 & インサート
    for category_id, slug in CATEGORY_SLUGS.items():
        print(f"\n==== Category {category_id}: {slug} ====")
        by_lang = load_category_all_lang(slug)

        base = by_lang.get(1, [])  # 日本語を正準
        if not base:
            print("  !! 日本語ページでQ/Aが見つかりません。スキップ")
            continue

        # 各Q/A（日本語の件数に合わせる）
        for idx, (q_ja, a_ja) in enumerate(base, start=1):
            # 1) question（JA基準で1件作成）
            qid = insert_question(cur, category_id, user_id)

            # 2) answer は Q ごとに 1 件だけ作成
            aid = insert_answer(cur)

            # 3) 各言語の 翻訳(question_translation, answer_translation) をぶら下げる
            for code, lang_id, _ in LANGS:
                # 言語ごとの(Q, A)取得（無ければ空文字）
                q_text = ""
                a_html = ""
                pairs = by_lang.get(lang_id, [])
                if idx - 1 < len(pairs):
                    q_text, a_html = pairs[idx - 1]

                # 質問翻訳（プレーン）
                insert_q_trans(cur, qid, lang_id, q_text)

                # 回答翻訳：HTML→自然文（URL保持）
                a_text_plain = html_to_plaintext(a_html)
                insert_a_trans(cur, aid, lang_id, a_text_plain)

            # 4) QAリンクは1回だけ
            link_QA(cur, qid, aid)

            if idx % 5 == 0:
                conn.commit()
                print(f"  ... inserted {idx} QAs")

        conn.commit()
        print(f"✅ Category {category_id} done: {len(base)} base QAs")

    # （任意）DBの空き領域を縮小したい場合
    try:
        conn.execute("VACUUM;")
    except Exception:
        pass

    conn.close()
    print("\n🎉 All done.")

if __name__ == "__main__":
    main()

#Question tableにcontentを入れるコード
import requests
from bs4 import BeautifulSoup
import sqlite3
from datetime import datetime

DB_PATH = "ShigaChat.db"
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

async def fetch_questions_ja(url: str):
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

async def main():
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

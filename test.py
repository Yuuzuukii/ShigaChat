import time
import os
from dotenv import load_dotenv
from openai import OpenAI
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lex_rank import LexRankSummarizer

# プロジェクト内の .env を優先して探索
for _env_path in [
    os.path.join(os.path.dirname(__file__), ".env"),
    os.path.join(os.path.dirname(__file__), "app", ".env"),
]:
    if os.path.exists(_env_path):
        load_dotenv(dotenv_path=_env_path)
        break
else:
    load_dotenv()  # システム既定の場所も試す

text = """
Pythonは1991年にグイド・ヴァン・ロッサムにより開発されたプログラミング言語である。

最初にリリースされたPythonの設計哲学は、ホワイトスペース(オフサイドルール)の顕著な使用によってコードの可読性を重視している。その言語構成とオブジェクト指向のアプローチは、プログラマが小規模なプロジェクトから大規模なプロジェクトまで、明確で論理的なコードを書くのを支援することを目的としている。

Pythonは動的に型付けされていて、ガベージコレクションされている。構造化（特に手続き型）、オブジェクト指向、関数型プログラミングを含む複数のプログラミングパラダイムをサポートしている。Pythonは、その包括的な標準ライブラリのため、しばしば「バッテリーを含む」言語と表現されている[† 1]。

Pythonのインタプリタは多くのOSに対応している。プログラマーのグローバルコミュニティは、自由かつオープンソース [† 2] のリファレンス実装であるCPythonを開発および保守している 。非営利団体であるPythonソフトウェア財団は、PythonとCPythonの開発のためのリソースを管理・指導している。
"""

# ── 1. sumy (LexRank) による要約 ────────────────────────────────────────────
print("=" * 60)
print("【sumy (LexRank) による要約】")
print("=" * 60)

start_sumy = time.time()
parser = PlaintextParser.from_string(text, Tokenizer("japanese"))
summarizer = LexRankSummarizer()
summary = summarizer(parser.document, 1)  # 3文に要約
elapsed_sumy = time.time() - start_sumy

for sentence in summary:
    print(sentence)
print(f"\n⏱  処理時間: {elapsed_sumy:.3f} 秒\n")

# ── 2. OpenAI LLM による要約 ────────────────────────────────────────────────
print("=" * 60)
print("【OpenAI LLM (gpt-5-nano) による要約】")
print("=" * 60)

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("⚠  OPENAI_API_KEY が設定されていないため LLM 要約をスキップします。")
else:
    client = OpenAI(api_key=api_key)
    prompt = (
        "以下のテキストを日本語で3文に要約してください。\n\n"
        f"{text.strip()}"
    )

    start_llm = time.time()
    response = client.responses.create(
        model="gpt-5-nano",
        input=prompt,
        reasoning={"effort": "minimal"},
    )
    elapsed_llm = time.time() - start_llm

    llm_summary = (response.output_text or "").strip()
    print(llm_summary)
    print(f"\n⏱  処理時間: {elapsed_llm:.3f} 秒\n")

    # ── 3. 時間比較 ─────────────────────────────────────────────────────────
    print("=" * 60)
    print("【処理時間 比較】")
    print("=" * 60)
    print(f"  sumy (LexRank) : {elapsed_sumy:.3f} 秒")
    print(f"  OpenAI LLM     : {elapsed_llm:.3f} 秒")
    faster = "sumy" if elapsed_sumy < elapsed_llm else "OpenAI LLM"
    ratio = max(elapsed_sumy, elapsed_llm) / min(elapsed_sumy, elapsed_llm)
    print(f"\n  ✅ {faster} の方が約 {ratio:.1f} 倍速い")

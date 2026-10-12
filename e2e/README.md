# e2e テスト

実際の画面（Playwright）から質問を送り、回答を確認します。アプリ一式（`docker compose up`）が起動している状態で実行します。

```bash
cd e2e
cp .env.example .env   # E2E_PASSWORD を設定
npm install
```

## 種類

| コマンド | 内容 |
|---|---|
| `npm test` | 回答を集めるだけ（採点なし）。`data/test_cases*.csv` と `data/test_conversations.csv` を使う |
| `npm run test:quality` | **回答の妥当性**。`data/eval_*.csv` の質問を送り、回答を LLM が採点する |
| `npm run test:load` | **同時アクセス時のレイテンシ**。複数アカウントのブラウザから同時に質問する |

結果は `results/<日時>/` に出ます（git 管理外）。残しておきたい結果は `reports/` にコピーします。これまでの測定結果は [REPORT.md](REPORT.md) にまとめています。

## 回答の妥当性（test:quality）

- 質問: `data/eval_cases.csv`（単発 57 件。うち 5 件は DB に答えがない質問）と `data/eval_conversations.csv`（連続質問 15 本 × 3 ターン）
- 正解: 各行の `gold_question_ids`（正解のQA）と `reference_answer`（要点）。審判には、正解QAの全文（`data/eval_sources.json`）とボットが参照したQAも渡す
- 判定（1 問ごとに記録）
  - LLM 審判: 5 段階のスコアと、根拠にない事実を言っていないか。**score 4 以上かつ捏造なしで pass**。テストの成否はこれで決まる
  - キーワード: `must_include` が回答に全部含まれるか（参考値）
  - 参照: 正解QAが、回答に付いた参照に含まれるか（参考値。画面に出る「選別後」の参照なので、検索の再現率そのものではない）
- 出力: `eval-results.csv`（1 問 1 行）、`eval-summary.json`（全体・単発/連続・ターン別・カテゴリ別の集計と、不合格の一覧）

```bash
E2E_LIMIT=5 npm run test:quality          # 先頭 5 件だけ
E2E_JUDGE_MODEL=gpt-5.4-mini npm run test:quality   # 審判のモデル（既定）
```

DB のQAを更新したら、正解QAの全文を作り直します（IDも変わっている場合は `data/eval_*.csv` の `gold_question_ids` も確認）。

```bash
python3 scripts/export_eval_sources.py
```

## 同時アクセス（test:load）

`e2e-load-01`… のアカウントを自動登録し、それぞれ別のブラウザでログインしたうえで、全員が入力を終えた瞬間に一斉送信します。

```bash
E2E_LOAD_LEVELS=1,5,10,20 E2E_LOAD_ROUNDS=3 E2E_LABEL=after-async npm run test:load
```

- `E2E_LOAD_LEVELS`: 同時接続数。`1` を先頭に入れると基準値になる
- `E2E_LOAD_ROUNDS`: 各レベルで一斉送信を何回繰り返すか
- `E2E_LABEL`: 修正の前後を比べるときの名前
- 出力: `load-summary.md`（同時接続数ごとの p50 / p95 / max）、`load-results.csv`（1 リクエスト 1 行）、`load-summary.json`
- 計測する段階（フロントが受け取った SSE の到達時刻。単位 ms）

| 列 | 意味 |
|---|---|
| service受付 | service が履歴取得などを終えた |
| agent到達 | agent に処理が渡った |
| 検索(埋め込み+DB) | 埋め込み生成とベクトル検索そのものの所要 |
| 回答開始 | 検索・選別が終わり、回答の生成を始めた |
| 最初の文字 | 最初のトークンが届いた |
| 全体 | 回答がすべて届いた |

同時接続数を増やしたときに、どの段階が伸びるかを見ます。OpenAI の応答時間は変動するので、比べるときは同じ条件で複数回測ってください。

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { parse } = require("csv-parse/sync");
const { DATA_DIR } = require("./paths");

const JUDGE_MODEL = process.env.E2E_JUDGE_MODEL || "gpt-5.4-mini";

// 正解QAの全文。審判が「根拠にある内容か」を確かめるために使う（scripts/export_eval_sources.py で生成）
let sourcesCache;
function loadSources() {
  if (!sourcesCache) {
    const file = path.join(DATA_DIR, "eval_sources.json");
    sourcesCache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  }
  return sourcesCache;
}

function readCsv(name) {
  const text = fs.readFileSync(path.join(DATA_DIR, name), "utf8");
  return parse(text, { columns: true, bom: true, skip_empty_lines: true });
}

function limit(items) {
  const n = Number(process.env.E2E_LIMIT || 0);
  return n > 0 ? items.slice(0, n) : items;
}

function splitList(value) {
  return String(value || "")
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
}

function toCase(row) {
  return {
    question: row.question,
    category: row.category,
    goldIds: splitList(row.gold_question_ids).map(Number),
    goldTitles: row.gold_titles,
    reference: row.reference_answer,
    mustInclude: splitList(row.must_include),
    expectRefs: row.expect_refs !== "no",
    note: row.note,
  };
}

/** 単発の評価ケース: [{ id, ...case }] */
function loadEvalCases() {
  return limit(readCsv("eval_cases.csv").map((row) => ({ id: row.id, ...toCase(row) })));
}

/** 連続質問の評価ケース: [{ id, category, note, turns: [case, ...] }] */
function loadEvalConversations() {
  const byId = new Map();
  for (const row of readCsv("eval_conversations.csv")) {
    if (!byId.has(row.conversation_id)) {
      byId.set(row.conversation_id, { id: row.conversation_id, category: row.category, note: row.note, turns: [] });
    }
    const conv = byId.get(row.conversation_id);
    if (row.note && !conv.note) conv.note = row.note;
    conv.turns[Number(row.turn) - 1] = toCase(row);
  }
  return limit([...byId.values()]);
}

// 全角数字・カンマ・空白の揺れをならして比較する
function normalize(text) {
  return String(text || "").normalize("NFKC").replace(/[,，\s]/g, "");
}

/** 参照QAが正解に当たったか */
function checkRetrieval(references, testCase) {
  const ids = references.map((ref) => Number(ref.question_id)).filter((id) => !Number.isNaN(id));
  const hits = ids.filter((id) => testCase.goldIds.includes(id));
  return {
    ref_count: references.length,
    ref_hit: testCase.goldIds.length ? hits.length > 0 : null,
    ref_precision: testCase.goldIds.length && ids.length ? Number((hits.length / ids.length).toFixed(2)) : null,
    // 答えがないはずの質問に、参照が付いてしまったか
    spurious_refs: testCase.expectRefs ? null : references.length > 0,
  };
}

/** 必須キーワードがすべて回答に含まれるか */
function checkKeywords(answer, testCase) {
  const body = normalize(answer);
  const missing = testCase.mustInclude.filter((kw) => !body.includes(normalize(kw)));
  return { keywords_ok: missing.length === 0, keywords_missing: missing };
}

function readApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  // リポジトリ直下の .env から、キーだけを読む
  const rootEnv = path.join(__dirname, "..", "..", ".env");
  if (fs.existsSync(rootEnv)) return dotenv.parse(fs.readFileSync(rootEnv)).OPENAI_API_KEY;
  return undefined;
}

const JUDGE_SCHEMA = {
  name: "judgement",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["score", "hallucination", "reason"],
    properties: {
      score: { type: "integer", description: "1〜5。5=参照回答と整合し、質問に十分答えている" },
      hallucination: { type: "boolean", description: "参照回答にない具体的な事実(電話番号・金額・日付・制度名など)を述べたか" },
      reason: { type: "string", description: "判定理由を日本語で80字以内" },
    },
  },
};

function judgePrompt(testCase, answer, history, references) {
  const past = history.length
    ? `【これまでの会話】\n${history.map((h) => `ユーザー: ${h.question}\nボット: ${h.answer}`).join("\n\n")}\n\n`
    : "";

  // 根拠: 正解QAの全文 + ボットが実際に参照したQA。ここに書かれている内容は捏造ではない
  const sources = loadSources();
  const blocks = new Map();
  for (const id of testCase.goldIds) {
    if (sources[id]) blocks.set(`gold:${id}`, `[正解QA ${id}] ${sources[id].question}\n${sources[id].answer}`);
  }
  for (const ref of references) {
    const key = `gold:${ref.question_id}`;
    if (!blocks.has(key)) blocks.set(`ref:${ref.question_id}`, `[ボットが参照したQA ${ref.question_id}] ${ref.question}\n${ref.answer}`);
  }
  const sourceText = [...blocks.values()].join("\n\n---\n\n") || "(なし)";

  const expectation = testCase.expectRefs
    ? `【期待される回答の要点(採点者向けメモ)】\n${testCase.reference}`
    : `【この質問の想定】\n${testCase.reference}\n正解となる参照QAは存在しない。根拠のない断定をせず、情報がないことを伝えるか、一般的な案内にとどめていれば良い回答とする。`;

  return `あなたは多文化共生相談チャットボットの回答を採点する審査員です。
ボットは滋賀県の外国人向けQAデータベースを根拠に答える設計です。次の基準で採点してください。

採点基準(1〜5):
5: 質問の意図に答えており、根拠QAと矛盾せず、要点(連絡先・条件・金額など)が過不足なく含まれる
4: 概ね正しく有用だが、要点の一部が欠ける、または冗長
3: 一部しか答えていない、または重要な要点が欠ける
2: 質問とずれている、または根拠QAと食い違う点がある
1: 誤り、無関係、または答えていない

hallucination: 回答が、下の【根拠QA】のどこにも書かれていない具体的な事実(電話番号、金額、日付、制度名、機関名、条件)を断定していれば true。
根拠QAに書かれている内容(電話番号や条件を含む)を使うのは捏造ではない。根拠QAの言い換え、一般的な言い回し、質問への共感も false。
冗長さや、質問と直接関係のない根拠QAの内容を付け加えることは、score を下げる理由にはなるが hallucination ではない。

${past}【今回のユーザーの質問】\n${testCase.question}\n\n${expectation}\n\n【根拠QA(正解QAの全文と、ボットが参照したQA)】\n${sourceText}\n\n【採点対象のボットの回答】\n${answer}`;
}

/** LLM による採点。verdict は score>=4 かつ hallucination なし のとき pass */
async function judgeAnswer(testCase, answer, history = [], references = []) {
  const apiKey = readApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY が見つかりません（e2e/.env またはリポジトリ直下の .env）");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [{ role: "user", content: judgePrompt(testCase, answer, history, references) }],
      response_format: { type: "json_schema", json_schema: JUDGE_SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`judge API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const parsed = JSON.parse(body.choices[0].message.content);
  return {
    judge_score: parsed.score,
    judge_hallucination: parsed.hallucination,
    judge_reason: parsed.reason,
    judge_verdict: parsed.score >= 4 && !parsed.hallucination ? "pass" : "fail",
    judge_model: JUDGE_MODEL,
  };
}

/** 検索・キーワード・LLM判定をまとめて評価する */
async function evaluate(entry, testCase, history = []) {
  return {
    ...checkRetrieval(entry.references, testCase),
    ...checkKeywords(entry.answer, testCase),
    ...(await judgeAnswer(testCase, entry.answer, history, entry.references)),
  };
}

module.exports = { loadEvalCases, loadEvalConversations, evaluate, judgeAnswer, checkRetrieval, checkKeywords, normalize };

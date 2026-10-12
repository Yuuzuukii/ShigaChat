const fs = require("fs");
const path = require("path");
const { stringify } = require("csv-stringify/sync");
const { runDir } = require("./paths");

// results.jsonl を、Excel で開ける results.csv にまとめる
function readJsonl(name) {
  const file = path.join(runDir(), name);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const rate = (items, pick) => {
  const valid = items.map(pick).filter((v) => v !== null && v !== undefined);
  return valid.length ? Number((valid.filter(Boolean).length / valid.length).toFixed(3)) : null;
};
const mean = (values) => {
  const v = values.filter((x) => typeof x === "number");
  return v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)) : null;
};

function groupStats(rows) {
  return {
    count: rows.length,
    judge_pass_rate: rate(rows, (r) => r.judge_verdict === "pass"),
    judge_score_mean: mean(rows.map((r) => r.judge_score)),
    hallucination_rate: rate(rows, (r) => r.judge_hallucination),
    keywords_ok_rate: rate(rows, (r) => r.keywords_ok),
    ref_hit_rate: rate(rows, (r) => r.ref_hit), // 正解QAが参照に含まれた割合
    spurious_ref_rate: rate(rows, (r) => r.spurious_refs), // 答えがない質問に参照が付いた割合
  };
}

// 回答の妥当性テスト(eval.jsonl)を CSV と要約にまとめる
function writeEvalReport() {
  const rows = readJsonl("eval.jsonl");
  if (!rows.length) return;

  const csv = stringify(
    rows.map((r) => ({
      ...r,
      references: r.references.join("\n"),
      gold_ids: r.gold_ids.join(";"),
      keywords_missing: (r.keywords_missing || []).join(";"),
    })),
    { header: true, bom: true }
  );
  fs.writeFileSync(path.join(runDir(), "eval-results.csv"), csv);

  const group = (keyFn) => {
    const out = {};
    for (const key of [...new Set(rows.map(keyFn))]) out[key] = groupStats(rows.filter((r) => keyFn(r) === key));
    return out;
  };
  const summary = {
    judge_model: rows[0].judge_model,
    overall: groupStats(rows),
    by_kind: group((r) => r.kind),
    by_turn: group((r) => `turn${r.turn}`), // 連続質問で、後ろのターンほど悪化していないか
    by_category: group((r) => r.category),
    failed: rows
      .filter((r) => r.judge_verdict !== "pass")
      .map((r) => ({ case: `${r.case_id}-${r.turn}`, question: r.question, score: r.judge_score, reason: r.judge_reason })),
  };
  fs.writeFileSync(path.join(runDir(), "eval-summary.json"), JSON.stringify(summary, null, 2));

  const o = summary.overall;
  console.log(
    `\n妥当性: ${o.count}問 / 合格率 ${o.judge_pass_rate} / 平均スコア ${o.judge_score_mean} / 捏造 ${o.hallucination_rate}` +
      ` / キーワード一致 ${o.keywords_ok_rate} / 正解QAが参照に含まれた割合 ${o.ref_hit_rate}` +
      `\n→ ${path.join(runDir(), "eval-summary.json")}`
  );
}

module.exports = async () => {
  writeEvalReport();

  const jsonl = path.join(runDir(), "results.jsonl");
  if (!fs.existsSync(jsonl)) return;

  const rows = fs
    .readFileSync(jsonl, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((r) => ({
      kind: r.kind,
      case_id: r.case_id,
      turn: r.turn,
      category: r.category,
      summary: r.summary,
      question: r.question,
      status: r.status,
      seconds: r.seconds,
      ref_count: r.references.length,
      answer: r.answer,
      references: r.references.map((ref) => ref.question || ref.title || "").join("\n"),
      error: r.error,
      thread_id: r.thread_id,
    }));

  const csv = stringify(rows, { header: true, bom: true });
  fs.writeFileSync(path.join(runDir(), "results.csv"), csv);

  const failed = rows.filter((r) => r.status !== "ok").length;
  console.log(`\n結果: ${rows.length} 問中 ${failed} 問が失敗 → ${path.join(runDir(), "results.csv")}`);
};

const fs = require("fs");
const path = require("path");
const { stringify } = require("csv-stringify/sync");
const { runDir } = require("./paths");

// results.jsonl を、Excel で開ける results.csv にまとめる
module.exports = async () => {
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

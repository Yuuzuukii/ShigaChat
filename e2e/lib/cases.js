const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { DATA_DIR } = require("./paths");

function readCsv(name) {
  const text = fs.readFileSync(path.join(DATA_DIR, name), "utf8");
  return parse(text, { columns: true, bom: true, skip_empty_lines: true });
}

function limit(items) {
  const n = Number(process.env.E2E_LIMIT || 0);
  return n > 0 ? items.slice(0, n) : items;
}

/** 単発の質問: [{ id, category, summary, question }] */
function loadSingleCases() {
  return limit(readCsv("test_cases.csv").filter((row) => row.question));
}

/** 連続チャット: [{ id, category, turns: [question, ...] }] */
function loadConversations() {
  const byId = new Map();
  for (const row of readCsv("test_conversations.csv")) {
    if (!byId.has(row.conversation_id)) {
      byId.set(row.conversation_id, { id: row.conversation_id, category: row.category, turns: [] });
    }
    byId.get(row.conversation_id).turns[Number(row.turn) - 1] = row.question;
  }
  return limit([...byId.values()]);
}

module.exports = { loadSingleCases, loadConversations };

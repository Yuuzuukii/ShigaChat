/** SSE のイベント列から、段階ごとの到達時刻(ms)を取り出す */
function stagesFromTimeline(timeline) {
  const at = (name) => timeline.find((e) => e.name === name)?.ms ?? null;
  const diff = (a, b) => (a !== null && b !== null ? a - b : null);
  const vectorDone = at("vector_search_done");
  return {
    thread_ready_ms: at("thread_ready"), // service が履歴取得・タイトル生成を終えた時点
    agent_started_ms: at("history_loaded"), // agent に処理が渡った時点
    vector_search_done_ms: vectorDone,
    search_step_ms: diff(vectorDone, at("query_rewritten")), // 埋め込み+DB検索そのものの所要
    reference_selected_ms: at("reference_selected"),
    answer_start_ms: at("answer_start"),
    first_token_ms: at("token"),
    total_ms: at("end"),
  };
}

function percentile(values, p) {
  const sorted = values.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const METRICS = [
  ["thread_ready_ms", "service受付"],
  ["agent_started_ms", "agent到達"],
  ["search_step_ms", "検索(埋め込み+DB)"],
  ["vector_search_done_ms", "検索完了"],
  ["answer_start_ms", "回答開始"],
  ["first_token_ms", "最初の文字"],
  ["total_ms", "全体"],
];

/** 同時接続数(level)ごとに、各段階の p50 / p95 / max を集計する */
function summarize(rows) {
  const levels = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  return levels.map((level) => {
    const group = rows.filter((r) => r.level === level);
    const ok = group.filter((r) => r.status === "ok");
    const stats = {};
    for (const [key] of METRICS) {
      const values = ok.map((r) => r[key]);
      stats[key] = { p50: percentile(values, 50), p95: percentile(values, 95), max: percentile(values, 100) };
    }
    return { level, requests: group.length, errors: group.length - ok.length, stats };
  });
}

function toMarkdown(summary, label) {
  const fmt = (v) => (v === null ? "-" : v);
  const lines = [`# 負荷テスト結果${label ? ` (${label})` : ""}`, "", "単位は ms。p50 / p95 / max。", ""];
  lines.push(`| 同時接続 | 失敗/件数 | ${METRICS.map(([, name]) => name).join(" | ")} |`);
  lines.push(`|---|---|${METRICS.map(() => "---").join("|")}|`);
  for (const s of summary) {
    const cells = METRICS.map(([key]) => `${fmt(s.stats[key].p50)} / ${fmt(s.stats[key].p95)} / ${fmt(s.stats[key].max)}`);
    lines.push(`| ${s.level} | ${s.errors}/${s.requests} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}

/** 全員が揃うまで待つ。誰かが来られなくても止まらないよう、タイムアウトで解放する */
function createBarrier(parties, timeoutMs = 60000) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const timer = setTimeout(release, timeoutMs);
  return () => {
    if (++arrived >= parties) {
      clearTimeout(timer);
      release();
    }
    return gate;
  };
}

module.exports = { stagesFromTimeline, summarize, toMarkdown, createBarrier, METRICS };

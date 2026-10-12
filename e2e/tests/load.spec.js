const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { stringify } = require("csv-stringify/sync");
const { loadEvalCases } = require("../lib/eval");
const { openNewChat, ask } = require("../lib/chat");
const { runDir } = require("../lib/paths");
const { stagesFromTimeline, summarize, toMarkdown, createBarrier } = require("../lib/load");

// 複数ユーザーの同時アクセス: 別アカウントでログインした複数のブラウザから、同じ瞬間に質問を送る。
//   E2E_LOAD_LEVELS  同時接続数を昇順で。既定 "1,5,10"（1 が基準値）
//   E2E_LOAD_ROUNDS  各レベルで何回、全員同時に送るか。既定 1
//   E2E_LABEL        結果に付けるラベル（修正前後の比較用）

const API_URL = process.env.E2E_API_URL || "http://localhost:8000";
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const PREFIX = process.env.E2E_LOAD_USER_PREFIX || "e2e-load";
const LEVELS = (process.env.E2E_LOAD_LEVELS || "1,5,10").split(",").map(Number).filter(Boolean);
const ROUNDS = Number(process.env.E2E_LOAD_ROUNDS || 1);
const LABEL = process.env.E2E_LABEL || "";
const MAX_USERS = Math.max(...LEVELS);

const accountName = (index) => `${PREFIX}-${String(index + 1).padStart(2, "0")}`;

async function login(browser, name, password) {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "ja-JP", viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#nickname").fill(name);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /^(ログイン|Login)$/ }).click();
  await page.waitForURL("**/home");
  return { context, page, name };
}

test("複数ユーザーの同時質問 @load", async ({ browser, request }) => {
  const password = process.env.E2E_PASSWORD;
  expect(password, "e2e/.env に E2E_PASSWORD を設定してください").toBeTruthy();
  test.setTimeout(30 * 60 * 1000);

  // 負荷用アカウントを用意する（既にあれば 409 が返るだけ）
  for (let i = 0; i < MAX_USERS; i++) {
    await request.post(`${API_URL}/user/register`, {
      data: { name: accountName(i), password, spoken_language: "日本語" },
    });
  }

  // ログインは計測の前に済ませておく（数人ずつ）
  const users = [];
  for (let i = 0; i < MAX_USERS; i += 5) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(5, MAX_USERS - i) }, (_, k) => login(browser, accountName(i + k), password))
    );
    users.push(...batch);
  }

  const questions = loadEvalCases().filter((c) => c.expectRefs);
  expect(questions.length, "評価ケースがありません").toBeGreaterThan(0);

  const rows = [];
  let cursor = 0;
  try {
    for (const level of LEVELS) {
      const active = users.slice(0, level);
      for (let round = 1; round <= ROUNDS; round++) {
        // 画面を開き直してから、全員が入力を終えた時点で一斉に送信する
        await Promise.all(active.map((u) => openNewChat(u.page)));
        const waitForEveryone = createBarrier(level);

        const picked = active.map(() => questions[cursor++ % questions.length]);
        const results = await Promise.allSettled(
          active.map((u, i) =>
            ask(
              u.page,
              picked[i].question,
              { kind: "load", case_id: picked[i].id, turn: 1, category: `level${level}`, summary: u.name },
              { beforeSend: waitForEveryone }
            )
          )
        );

        results.forEach((result, i) => {
          const entry = result.status === "fulfilled" ? result.value : null;
          rows.push({
            level,
            round,
            user: active[i].name,
            case_id: picked[i].id,
            question: picked[i].question,
            status: entry ? "ok" : "error",
            error: entry ? "" : String(result.reason?.message || result.reason).split("\n")[0],
            ...stagesFromTimeline(entry?.timeline ?? []),
          });
        });
      }
    }
  } finally {
    await Promise.all(users.map((u) => u.context.close()));
  }

  const summary = summarize(rows);
  const dir = runDir();
  fs.writeFileSync(path.join(dir, "load-results.csv"), stringify(rows, { header: true, bom: true }));
  fs.writeFileSync(path.join(dir, "load-summary.json"), JSON.stringify({ label: LABEL, levels: LEVELS, rounds: ROUNDS, summary }, null, 2));
  const markdown = toMarkdown(summary, LABEL);
  fs.writeFileSync(path.join(dir, "load-summary.md"), markdown);
  console.log(`\n${markdown}\n→ ${dir}`);

  const failed = rows.filter((r) => r.status !== "ok");
  expect(failed, `失敗: ${failed.map((r) => `${r.user}: ${r.error}`).join(" / ")}`).toHaveLength(0);
});

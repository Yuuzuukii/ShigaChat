const fs = require("fs");
const path = require("path");
const { expect } = require("@playwright/test");
const { runDir } = require("./paths");

const STREAM_PATH = "/question/get_answer_stream";
const GENERATING_LABEL = "回答を生成しています...";

function parseSse(body) {
  const events = [];
  for (const raw of body.replace(/\r\n/g, "\n").split("\n\n")) {
    const name = raw.match(/^event: (.*)$/m)?.[1];
    const data = raw.match(/^data: (.*)$/m)?.[1];
    if (!name || !data) continue;
    try {
      events.push({ name, data: JSON.parse(data) });
    } catch {}
  }
  return events;
}

function appendJsonl(name, entry) {
  fs.appendFileSync(path.join(runDir(), name), `${JSON.stringify(entry)}\n`);
}

function record(entry) {
  appendJsonl("results.jsonl", entry);
}

// ブラウザ側で fetch を包み、SSE の各イベントがいつ届いたか（fetch 開始からの ms）を記録する。
// 画面の挙動には触れず、レスポンスを clone して読むだけ。
function installSseTimer() {
  if (window.__sseInstalled) return; // openNewChat を重ねて呼んでも二重に包まない
  window.__sseInstalled = true;
  const originalFetch = window.fetch;
  window.__sse = [];
  window.fetch = async (...args) => {
    const startedAt = performance.now();
    const response = await originalFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
    if (url && url.includes("/question/get_answer_stream") && response.body) {
      const run = { events: [], done: false };
      window.__sse.push(run);
      const reader = response.clone().body.getReader();
      const decoder = new TextDecoder();
      (async () => {
        let buffer = "";
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            let index;
            while ((index = buffer.indexOf("\n\n")) >= 0) {
              const raw = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              const name = raw.match(/^event: (.*)$/m)?.[1];
              if (name) run.events.push({ name, ms: Math.round(performance.now() - startedAt) });
            }
          }
        } catch {}
        run.done = true;
      })();
    }
    return response;
  };
}

/** 新しいチャットを開く（tid なしの /home は新規スレッドになる） */
async function openNewChat(page) {
  await page.addInitScript(installSseTimer);
  await page.goto("/home");
  await expect(page.locator("#chat-question")).toBeVisible();
}

/**
 * UI から 1 問送信し、回答が画面に出るまで待って結果を記録する。
 * 回答本文と参照 Q&A は、画面が受け取った SSE レスポンスから取り出す。
 */
async function ask(page, question, meta, options = {}) {
  const input = page.locator("#chat-question");
  const sendButton = page.locator('form button[type="submit"]');
  const entry = {
    ...meta,
    question,
    status: "ok",
    seconds: null,
    answer: "",
    references: [],
    error: "",
    thread_id: null,
    timeline: [],
  };

  const startedAt = Date.now();
  try {
    await input.fill(question);
    // 複数ユーザーで同時に送信したいとき、全員が入力を終えるまでここで待たせる
    if (options.beforeSend) await options.beforeSend();
    const responsePromise = page.waitForResponse((res) => res.url().includes(STREAM_PATH), {
      timeout: 120 * 1000,
    });
    await sendButton.click();

    const response = await responsePromise;
    if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
    // ストリームが閉じるまで待ってから本文を読む
    const events = parseSse(await response.text());
    entry.seconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));

    const streamError = events.find((e) => e.name === "error");
    if (streamError) throw new Error(streamError.data.message || "stream error");
    const end = events.find((e) => e.name === "end");
    if (!end) throw new Error("end イベントが届かずにストリームが終了");

    entry.answer = end.data.answer || "";
    entry.references = end.data.ref_qa || [];
    entry.thread_id = end.data.thread_id ?? null;

    // 各イベントの到達時刻（ms）。fetch フックが入っていない場合は空のまま
    await page
      .waitForFunction(() => window.__sse?.at(-1)?.done, null, { timeout: 5000 })
      .catch(() => {});
    entry.timeline = await page.evaluate(() => window.__sse?.at(-1)?.events ?? []);

    // 画面側も生成完了の状態に戻り、エラー表示が出ていないこと
    await expect(sendButton).not.toHaveAttribute("aria-label", GENERATING_LABEL);
    await expect(page.locator('main [role="alert"], form ~ [role="alert"]')).toHaveCount(0);
    await expect(page.getByText(question, { exact: true }).last()).toBeVisible();
    expect(entry.answer.trim(), "回答が空").not.toBe("");
  } catch (error) {
    entry.status = "error";
    entry.error = String(error?.message || error).split("\n")[0];
    if (entry.seconds === null) entry.seconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
    record(entry);
    throw error;
  }

  record(entry);
  return entry;
}

module.exports = { openNewChat, ask, appendJsonl };

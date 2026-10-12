const fs = require("fs");
const path = require("path");
const { test: setup, expect } = require("@playwright/test");
const { AUTH_FILE } = require("../lib/paths");

const API_URL = process.env.E2E_API_URL || "http://localhost:8000";

setup("テスト用アカウントでログイン", async ({ page, request }) => {
  const name = process.env.E2E_USER;
  const password = process.env.E2E_PASSWORD;
  expect(name && password, "e2e/.env に E2E_USER と E2E_PASSWORD を設定してください").toBeTruthy();

  // アカウントがなければ日本語で作る（既にあれば 409 が返るだけ）
  await request.post(`${API_URL}/user/register`, {
    data: { name, password, spoken_language: "日本語" },
  });

  await page.goto("/login");
  await page.locator("#nickname").fill(name);
  await page.locator("#password").fill(password);
  // ログイン前の画面はブラウザの設定によって表示言語が変わる
  await page.getByRole("button", { name: /^(ログイン|Login)$/ }).click();
  await page.waitForURL("**/home");

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});

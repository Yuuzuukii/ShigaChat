const path = require("path");
const { defineConfig } = require("@playwright/test");
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = defineConfig({
  testDir: "./tests",
  // 1問ごとに実際に LLM を呼ぶので直列で実行する
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 5 * 60 * 1000,
  globalSetup: require.resolve("./lib/global-setup.js"),
  globalTeardown: require.resolve("./lib/global-teardown.js"),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    locale: "ja-JP",
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15 * 1000,
    navigationTimeout: 30 * 1000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.js/ },
    {
      name: "chat",
      testMatch: /chat\.spec\.js/,
      dependencies: ["setup"],
      use: { storageState: path.join(__dirname, ".auth/user.json") },
    },
    {
      // 回答の妥当性（LLM 採点）
      name: "quality",
      testMatch: /quality\.spec\.js/,
      dependencies: ["setup"],
      use: { storageState: path.join(__dirname, ".auth/user.json") },
    },
    {
      // 複数アカウントの同時アクセス。ログインはテスト内で行うので setup は不要
      name: "load",
      testMatch: /load\.spec\.js/,
    },
  ],
});

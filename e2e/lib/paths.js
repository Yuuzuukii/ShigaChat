const path = require("path");

const ROOT = path.join(__dirname, "..");

module.exports = {
  DATA_DIR: path.join(ROOT, "data"),
  AUTH_FILE: path.join(ROOT, ".auth/user.json"),
  RESULTS_DIR: path.join(ROOT, "results"),
  // 実行中の結果の置き場所（global-setup が決めて環境変数で worker に渡す）
  runDir: () => process.env.E2E_RUN_DIR,
};

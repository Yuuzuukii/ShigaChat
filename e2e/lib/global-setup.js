const fs = require("fs");
const path = require("path");
const { RESULTS_DIR } = require("./paths");

module.exports = async () => {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const runDir = path.join(RESULTS_DIR, stamp);
  fs.mkdirSync(runDir, { recursive: true });
  process.env.E2E_RUN_DIR = runDir;
};

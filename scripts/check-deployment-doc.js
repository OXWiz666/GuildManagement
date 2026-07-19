const fs = require("node:fs");
const path = require("node:path");

const checklist = path.join(__dirname, "..", "docs", "production-deployment-checklist.md");

if (!fs.existsSync(checklist)) {
  console.error("Missing docs/production-deployment-checklist.md");
  process.exit(1);
}

console.log("Before deploying, complete:");
console.log(checklist);
console.log("");
console.log("Recommended command:");
console.log("  pnpm deploy:check");

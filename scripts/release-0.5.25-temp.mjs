import fs from "node:fs";
import { execFileSync } from "node:child_process";

for (const path of ["package.json", "version.json"]) {
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  if (data.version !== "0.5.24") throw new Error(`${path}: expected 0.5.24, got ${data.version}`);
  data.version = "0.5.25";
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

execFileSync(process.execPath, ["scripts/sync-public-version.mjs"], { stdio: "inherit" });

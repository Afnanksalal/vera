import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, acc);
    } else if (name.endsWith(".test.ts")) acc.push(p);
  }
  return acc;
}

const files = walk("src");
if (files.length === 0) {
  console.error("No test files found");
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { stdio: "inherit", env: { ...process.env, VERA_TEST: "1", NODE_ENV: "test" } }
);
process.exit(result.status ?? 1);

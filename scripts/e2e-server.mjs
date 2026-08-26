import { rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const database = resolve(process.cwd(), "data", "vera-e2e.db");
for (const suffix of ["", "-shm", "-wal"]) rmSync(`${database}${suffix}`, { force: true });
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "43148", "--hostname", "127.0.0.1"], {
  stdio: "inherit",
  env: { ...process.env, VERA_TEST_DATABASE: database, VERA_TEST: "0" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));

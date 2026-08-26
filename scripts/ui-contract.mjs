import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const roots = ["src/app", "src/components"];
const forbidden = [
  [/<select\b/, "native <select>"],
  [/<details\b/, "native <details>"],
  [/<summary\b/, "native <summary>"],
  [/<dialog\b/, "native <dialog>"],
  [/<button\b/, "raw <button>"],
  [/<input\b/, "raw <input>"],
  [/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt"],
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(path));
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

const violations = [];
for (const root of roots) {
  for (const path of await files(root)) {
    const normalized = path.split(sep).join("/");
    if (normalized.startsWith("src/components/ui/")) continue;
    const source = await readFile(path, "utf8");
    const lines = source.split(/\r?\n/);
    for (const [pattern, label] of forbidden) {
      lines.forEach((line, index) => {
        if (pattern.test(line)) violations.push(`${relative(".", path)}:${index + 1}: ${label}`);
      });
    }
  }
}

if (violations.length) {
  console.error("Vera UI contract violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("UI contract passed: product screens use Vera components for interactive controls.");

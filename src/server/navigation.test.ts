import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError, readJson } from "./http";
import { safeRedirectPath } from "./navigation";

test("post-auth redirects accept only local application paths", () => {
  assert.equal(safeRedirectPath("/app/settings?tab=ai#provider"), "/app/settings?tab=ai#provider");
  assert.equal(safeRedirectPath(["/app/review", "//evil.example"]), "/app/review");
  assert.equal(safeRedirectPath("https://evil.example"), "/app");
  assert.equal(safeRedirectPath("//evil.example"), "/app");
  assert.equal(safeRedirectPath("/\\evil.example"), "/app");
  assert.equal(safeRedirectPath("/login"), "/app");
  assert.equal(safeRedirectPath(undefined, "/"), "/");
});

test("JSON reader accepts an object with the correct media type", async () => {
  const request = new Request("https://vera.example/api", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await readJson(request), { ok: true });
});

for (const [label, body] of [["null", "null"], ["array", "[]"], ["scalar", "42"]] as const) {
  test(`JSON reader rejects a ${label} top-level body`, async () => {
    const request = new Request("https://vera.example/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await assert.rejects(() => readJson(request), (error: unknown) => error instanceof HttpError && error.status === 400);
  });
}

test("JSON reader rejects unsupported media types", async () => {
  const request = new Request("https://vera.example/api", { method: "POST", body: "{}" });
  await assert.rejects(() => readJson(request), (error: unknown) => error instanceof HttpError && error.status === 415);
});

test("JSON reader applies limits to UTF-8 bytes", async () => {
  const request = new Request("https://vera.example/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "₹₹" }),
  });
  await assert.rejects(() => readJson(request, 14), (error: unknown) => error instanceof HttpError && error.status === 413);
});

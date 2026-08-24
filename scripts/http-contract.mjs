import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 43149;
const origin = `http://127.0.0.1:${port}`;
const output = [];
const testDirectory = mkdtempSync(join(tmpdir(), "vera-http-contract-"));
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--port", String(port), "--hostname", "127.0.0.1"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      VERA_TEST: "1",
      VERA_TEST_DATABASE: join(testDirectory, "vera.db"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);
server.stdout.on("data", (chunk) => output.push(String(chunk)));
server.stderr.on("data", (chunk) => output.push(String(chunk)));

async function request(path, options = {}) {
  return fetch(`${origin}${path}`, { redirect: "manual", ...options });
}

async function expectStatus(name, path, expected, options = {}) {
  const response = await request(path, options);
  if (response.status !== expected) {
    assert.fail(`${name}: expected ${expected}, received ${response.status}: ${await response.text()}`);
  }
  return response;
}

function json(body, headers = {}) {
  return { body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } };
}

function sessionCookie(response) {
  const value = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(value?.startsWith("vera_session="), "session cookie was not set");
  return value;
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`test server exited early\n${output.join("")}`);
    try {
      const response = await request("/api/health");
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`test server did not become ready\n${output.join("")}`);
}

try {
  await waitUntilReady();

  const freshHealth = await (await expectStatus("fresh health", "/api/health", 200)).json();
  assert.equal(freshHealth.initialized, false);
  await expectStatus("fresh login page", "/login", 200);
  await expectStatus("fresh signup page", "/signup", 200);

  await expectStatus("login before setup", "/api/auth/login", 409, {
    method: "POST",
    ...json({ email: "owner@example.com", password: "valid-password-12" }, { origin }),
  });
  await expectStatus("signup CSRF", "/api/auth/signup", 403, {
    method: "POST",
    ...json({ email: "owner@example.com", password: "valid-password-12" }),
  });
  await expectStatus("signup null JSON", "/api/auth/signup", 400, {
    method: "POST",
    body: "null",
    headers: { "content-type": "application/json", origin },
  });
  await expectStatus("signup media type", "/api/auth/signup", 415, {
    method: "POST",
    body: "{}",
    headers: { "content-type": "text/plain", origin },
  });
  await expectStatus("signup validation", "/api/auth/signup", 400, {
    method: "POST",
    ...json({ email: "invalid", password: "short" }, { origin }),
  });

  const signup = await expectStatus("owner signup", "/api/auth/signup", 201, {
    method: "POST",
    ...json({ email: "owner@example.com", password: "valid-password-12" }, { origin }),
  });
  const signupCookie = sessionCookie(signup);
  assert.equal((await (await request("/api/health")).json()).initialized, true);
  await expectStatus("signup remains available", "/signup", 200);
  const memberSignup = await expectStatus("member signup", "/api/auth/signup", 201, {
    method: "POST",
    ...json({ email: "second@example.com", password: "valid-password-12" }, { origin }),
  });
  const memberCookie = sessionCookie(memberSignup);
  await expectStatus("member session", "/api/auth/me", 200, { headers: { cookie: memberCookie } });
  await expectStatus("duplicate account", "/api/auth/signup", 409, {
    method: "POST",
    ...json({ email: "SECOND@example.com", password: "valid-password-12" }, { origin, "x-forwarded-for": "198.51.100.20" }),
  });
  await expectStatus("member cannot update installation settings", "/api/v1/settings", 403, {
    method: "PUT",
    ...json({ section: "system", public_url: "", allow_live_razorpay: false, max_ingest_events: 100000 }, { cookie: memberCookie, origin }),
  });

  await expectStatus("invalid login", "/api/auth/login", 401, {
    method: "POST",
    ...json({ email: "owner@example.com", password: "wrong-password-12" }, { origin }),
  });
  const login = await expectStatus("valid login", "/api/auth/login", 200, {
    method: "POST",
    ...json({ email: "OWNER@example.com", password: "valid-password-12" }, { origin }),
  });
  const loginCookie = sessionCookie(login);
  await expectStatus("authenticated session", "/api/auth/me", 200, { headers: { cookie: loginCookie } });

  const sessionInventory = await expectStatus("session inventory", "/api/auth/sessions", 200, { headers: { cookie: loginCookie } });
  const sessionBody = await sessionInventory.json();
  assert.equal(sessionBody.sessions.length, 2);
  assert.equal(sessionBody.sessions.filter((session) => session.current).length, 1);
  assert.equal("token" in sessionBody.sessions[0], false);
  const currentSession = sessionBody.sessions.find((session) => session.current);
  const signupSession = sessionBody.sessions.find((session) => !session.current);
  await expectStatus("cannot revoke current session", `/api/auth/sessions/${currentSession.id}`, 409, {
    method: "DELETE",
    headers: { cookie: loginCookie, origin },
  });
  await expectStatus("session revoke CSRF", `/api/auth/sessions/${signupSession.id}`, 403, {
    method: "DELETE",
    headers: { cookie: loginCookie },
  });
  await expectStatus("revoke one session", `/api/auth/sessions/${signupSession.id}`, 200, {
    method: "DELETE",
    headers: { cookie: loginCookie, origin },
  });
  await expectStatus("revoked session rejected", "/api/auth/me", 401, { headers: { cookie: signupCookie } });

  const extraLogin = await expectStatus("create another session", "/api/auth/login", 200, {
    method: "POST",
    ...json({ email: "owner@example.com", password: "valid-password-12" }, { origin }),
  });
  const extraCookie = sessionCookie(extraLogin);
  const revokeOthers = await expectStatus("revoke other sessions", "/api/auth/sessions", 200, {
    method: "DELETE",
    headers: { cookie: loginCookie, origin },
  });
  assert.equal((await revokeOthers.json()).revoked, 1);
  await expectStatus("other session rejected", "/api/auth/me", 401, { headers: { cookie: extraCookie } });
  await expectStatus("current session retained", "/api/auth/me", 200, { headers: { cookie: loginCookie } });

  const protectedGet = [
    "/api/v1/analysis", "/api/v1/calibration", "/api/v1/closes", "/api/v1/closes/missing",
    "/api/v1/keys", "/api/v1/ledger", "/api/v1/razorpay", "/api/v1/reviews", "/api/v1/settings",
  ];
  for (const path of protectedGet) await expectStatus(`anonymous GET ${path}`, path, 401);
  await expectStatus("anonymous session inventory", "/api/auth/sessions", 401);

  const invalidBearer = { authorization: "Bearer vera_invalid_contract_key", "content-type": "application/json" };
  const protectedPost = [
    "/api/investigate", "/api/v1/analysis", "/api/v1/calibration", "/api/v1/close", "/api/v1/ingest",
    "/api/v1/keys", "/api/v1/razorpay/checkout", "/api/v1/razorpay/orders", "/api/v1/razorpay/sync",
    "/api/v1/reviews/missing/ack", "/api/v1/verify-bundle",
  ];
  for (const path of protectedPost) {
    await expectStatus(`anonymous POST ${path}`, path, 401, { method: "POST", body: "{}", headers: invalidBearer });
  }
  for (const path of ["/api/v1/calibration", "/api/v1/keys/missing", "/api/v1/razorpay", "/api/v1/settings"]) {
    await expectStatus(`anonymous DELETE ${path}`, path, 401, { method: "DELETE", headers: invalidBearer });
  }
  for (const path of ["/api/v1/razorpay", "/api/v1/settings"]) {
    await expectStatus(`anonymous PUT ${path}`, path, 401, { method: "PUT", body: "{}", headers: invalidBearer });
  }

  await expectStatus("public key", "/api/v1/public-key", 200);
  await expectStatus("unknown webhook target", "/api/webhooks/razorpay/not-a-user", 404, {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json" },
  });
  await expectStatus("unsupported auth method", "/api/auth/login", 405);
  await expectStatus("unsupported health method", "/api/health", 405, { method: "POST" });

  const deepLink = await expectStatus("protected deep link", "/app/settings?tab=ai", 307);
  assert.equal(deepLink.headers.get("location"), "/login?next=%2Fapp%2Fsettings%3Ftab%3Dai");
  await expectStatus("authenticated deep link", "/app/settings?tab=ai", 200, { headers: { cookie: loginCookie } });

  await expectStatus("settings CSRF", "/api/v1/settings", 403, {
    method: "PUT",
    ...json({ section: "system", public_url: "", allow_live_razorpay: false, max_ingest_events: 100000 }, { cookie: loginCookie }),
  });
  await expectStatus("settings update", "/api/v1/settings", 200, {
    method: "PUT",
    ...json({ section: "system", public_url: "", allow_live_razorpay: false, max_ingest_events: 100000 }, { cookie: loginCookie, origin }),
  });

  await expectStatus("password validation", "/api/auth/password", 401, {
    method: "POST",
    ...json({ current_password: "wrong-password-12", new_password: "changed-password-34" }, { cookie: loginCookie, origin }),
  });
  const changed = await expectStatus("password change", "/api/auth/password", 200, {
    method: "POST",
    ...json({ current_password: "valid-password-12", new_password: "changed-password-34" }, { cookie: loginCookie, origin }),
  });
  const changedCookie = sessionCookie(changed);
  await expectStatus("old session revoked", "/api/auth/me", 401, { headers: { cookie: signupCookie } });
  await expectStatus("rotated session valid", "/api/auth/me", 200, { headers: { cookie: changedCookie } });
  await expectStatus("old password rejected", "/api/auth/login", 401, {
    method: "POST",
    ...json({ email: "owner@example.com", password: "valid-password-12" }, { origin }),
  });
  await expectStatus("new password accepted", "/api/auth/login", 200, {
    method: "POST",
    ...json({ email: "owner@example.com", password: "changed-password-34" }, { origin }),
  });

  await expectStatus("logout CSRF", "/api/auth/logout", 403, { method: "POST", headers: { cookie: changedCookie } });
  await expectStatus("logout", "/api/auth/logout", 200, { method: "POST", headers: { cookie: changedCookie, origin } });
  await expectStatus("logged-out session", "/api/auth/me", 401, { headers: { cookie: changedCookie } });

  console.log("HTTP contract audit passed");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
  rmSync(testDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

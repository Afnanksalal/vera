import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createUser, authenticate, createSession, sessionFromToken, createApiKey, userFromApiKey, changePassword, destroyAllSessions, destroyOtherSessions, destroySessionById, isOwner, listSessions, sessionContext } from "./auth";
import { getDb, resetDb } from "./db";
import { decryptSecret, encryptSecret, hashPassword, hmacSha256Hex, timingSafeEqualHex, verifyPassword } from "./crypto";
import { ingestRecords, closeUser, latestClose, listReviews, acknowledgeReview } from "./ledger";
import { EXAMPLE_RECORDS } from "@/mandate/examples";
import { paymentToRecord } from "./razorpay-map";
import { parseExternalRecord } from "./records";
import { resetRateLimit } from "./policy";
import { aiSettingsPublic, getSystemSettings, saveAiSettings, saveSystemSettings } from "./settings";
import { signingIdentity } from "./signing";
import { analyzeUser } from "./analysis";
import { calibrationRows, importCalibration } from "./calibration";
import { enqueueRazorpayWebhook } from "./webhooks";
import { mergeRazorpayRecord, settlementFromRazorpayRecon } from "./razorpay";
import { latestInvestigations, saveInvestigation } from "./investigations";

process.env.VERA_TEST = "1";

afterEach(() => {
  resetDb();
  resetRateLimit();
});

test("password hash verifies and rejects wrong secrets", () => {
  const stored = hashPassword("correct-horse-battery");
  assert.equal(verifyPassword("correct-horse-battery", stored), true);
  assert.equal(verifyPassword("wrong-password-12", stored), false);
});

test("secret envelope round-trips", () => {
  const cipher = encryptSecret("rzp_test_secret");
  assert.equal(decryptSecret(cipher), "rzp_test_secret");
  assert.notEqual(cipher, "rzp_test_secret");
});

test("hmac compare is length-safe", () => {
  const sig = hmacSha256Hex("whsec", '{"ok":true}');
  assert.equal(timingSafeEqualHex(sig, sig), true);
  assert.equal(timingSafeEqualHex(sig, "ab"), false);
});

test("signup, session, and API key authenticate", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  assert.equal(authenticate("ops@example.com", "super-secret-12")?.id, user.id);
  assert.equal(authenticate("ops@example.com", "nope-nope-nope"), null);
  const token = createSession(user.id);
  assert.equal(sessionFromToken(token)?.user.id, user.id);
  const key = createApiKey(user.id, "integration");
  assert.ok(key.secret.startsWith("vera_"));
  assert.equal(userFromApiKey(key.secret)?.id, user.id);
  assert.equal(userFromApiKey("vera_notarealkeyvaluexxx"), null);
});

test("active sessions expose safe metadata and support scoped revocation", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  const context = sessionContext(new Headers({
    "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
    "x-forwarded-for": "203.0.113.42",
  }));
  assert.deepEqual(context, { clientLabel: "Chrome on Windows", ipHint: "203.0.113.x" });
  const firstToken = createSession(user.id, context);
  const secondToken = createSession(user.id, { clientLabel: "Firefox on Linux", ipHint: "198.51.100.x" });
  const first = sessionFromToken(firstToken)!;
  const second = sessionFromToken(secondToken)!;
  const sessions = listSessions(user.id, second.sessionId);
  assert.equal(sessions.length, 2);
  assert.equal(sessions.find((item) => item.id === second.sessionId)?.current, true);
  assert.equal(sessions.find((item) => item.id === first.sessionId)?.ip_hint, "203.0.113.x");
  assert.equal(destroySessionById("ses_missing", user.id), false);
  assert.equal(destroySessionById(first.sessionId, user.id), true);
  assert.equal(sessionFromToken(firstToken), null);
  assert.equal(destroyOtherSessions(user.id, second.sessionId), 0);
  assert.equal(sessionFromToken(secondToken)?.sessionId, second.sessionId);
});

test("session count is capped and expired sessions are removed from inventory", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  const tokens = Array.from({ length: 25 }, () => createSession(user.id));
  const current = sessionFromToken(tokens.at(-1)!)!;
  assert.equal(listSessions(user.id, current.sessionId).length, 20);
  getDb().prepare("UPDATE sessions SET expires_at = 0 WHERE id = ?").run(current.sessionId);
  assert.equal(listSessions(user.id, current.sessionId).some((item) => item.id === current.sessionId), false);
});

test("installation settings persist without environment configuration", () => {
  assert.deepEqual(getSystemSettings(), { public_url: "", allow_live_razorpay: false, max_ingest_events: 100_000 });
  saveSystemSettings({ public_url: "https://vera.example.com", allow_live_razorpay: true, max_ingest_events: 250_000 });
  assert.deepEqual(getSystemSettings(), { public_url: "https://vera.example.com", allow_live_razorpay: true, max_ingest_events: 250_000 });
});

test("AI settings are encrypted and materialize a configured provider", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  saveAiSettings(user.id, { provider: "openai", model: "model-1", base_url: "https://models.example.com/v1", api_key: "secret-provider-key" });
  assert.deepEqual(aiSettingsPublic(user.id), { configured: true, provider: "openai", model: "model-1", base_url: "https://models.example.com/v1" });
});

test("AI settings update preserves the encrypted key when replacement is blank", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  saveAiSettings(user.id, { provider: "openai", model: "model-1", base_url: "https://models.example.com/v1", api_key: "secret-provider-key" });
  const before = getDb().prepare("SELECT api_key_cipher FROM ai_settings WHERE user_id = ?").get(user.id) as { api_key_cipher: string };
  saveAiSettings(user.id, { provider: "openai", model: "model-2", base_url: "https://models.example.com/v1", api_key: "" });
  const after = getDb().prepare("SELECT api_key_cipher FROM ai_settings WHERE user_id = ?").get(user.id) as { api_key_cipher: string };
  assert.equal(after.api_key_cipher, before.api_key_cipher);
  assert.equal(aiSettingsPublic(user.id).model, "model-2");
});

test("AI investigations are persisted per user, report, and payment", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  ingestRecords(user.id, "test", EXAMPLE_RECORDS);
  const close = closeUser(user.id);
  const firstSale = latestClose(user.id)!.claims[0].sale_id;
  saveInvestigation(user.id, {
    close_id: close.id,
    sale_id: firstSale,
    model: "claude-test",
    tool_calls: 3,
    claims: [{ type: "AUTHORIZED", ai_action: "prove", ai_code: null, rationale: "Evidence found.", verifier_accepted: true, verifier_reason: "accepted", final_status: "PROVEN", final_code: null }],
  });
  const stored = latestInvestigations(user.id, close.id).get(firstSale);
  assert.equal(stored?.model, "claude-test");
  assert.equal(stored?.tool_calls, 3);
  assert.equal(stored?.claims[0].verifier_accepted, true);
  const other = createUser("other@example.com", "super-secret-12");
  assert.equal(latestInvestigations(other.id, close.id).size, 0);
});

test("first account owns the installation and later accounts are isolated members", () => {
  const owner = createUser("owner@example.com", "super-secret-12");
  const member = createUser("member@example.com", "super-secret-12");
  assert.equal(isOwner(owner.id), true);
  assert.equal(isOwner(member.id), false);
  assert.equal(authenticate("member@example.com", "super-secret-12")?.id, member.id);
  assert.deepEqual(
    getDb().prepare("SELECT role, COUNT(*) AS count FROM users GROUP BY role ORDER BY role").all(),
    [{ role: "member", count: 1 }, { role: "owner", count: 1 }]
  );
  ingestRecords(owner.id, "owner-test", EXAMPLE_RECORDS);
  closeUser(owner.id);
  assert.ok(latestClose(owner.id));
  assert.equal(latestClose(member.id), null);
  assert.deepEqual(listReviews(member.id), []);
});

test("password change authenticates only the new password after sessions are revoked", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  const token = createSession(user.id);
  changePassword(user.id, "super-secret-12", "different-secret-34");
  destroyAllSessions(user.id);
  assert.equal(sessionFromToken(token), null);
  assert.equal(authenticate(user.email, "super-secret-12"), null);
  assert.equal(authenticate(user.email, "different-secret-34")?.id, user.id);
});

test("audit signing identity remains stable across closes", () => {
  const first = signingIdentity();
  const second = signingIdentity();
  assert.equal(first.publicKeyPem, second.publicKeyPem);
  assert.equal(first.privateKeyPem, second.privateKeyPem);
});

test("analysis runs against persisted records", async () => {
  const user = createUser("ops@example.com", "super-secret-12");
  ingestRecords(user.id, "integration", EXAMPLE_RECORDS);
  const result = await analyzeUser(user.id);
  assert.equal(result.source.sales, EXAMPLE_RECORDS.length);
  assert.equal(result.source.settlements, EXAMPLE_RECORDS.length);
  assert.equal(result.reconciliation.verify.ok, true);
});

test("duplicate email is rejected", () => {
  createUser("ops@example.com", "super-secret-12");
  assert.throws(() => createUser("ops@example.com", "super-secret-12"));
});

test("example ingest closes and opens reviews on faults", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  const ingest = ingestRecords(user.id, "examples", EXAMPLE_RECORDS);
  assert.equal(ingest.inserted, EXAMPLE_RECORDS.length);
  const close = closeUser(user.id);
  assert.ok(close.sales >= 1);
  assert.ok(close.excepted + close.abstained >= 1);
  const open = listReviews(user.id, "open");
  assert.ok(open.length >= 1);
  const ack = acknowledgeReview(user.id, open[0].id, "noted");
  assert.equal(ack.status, "acknowledged");
});

test("settlement verification accepts explicit processor fees and tax", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  const record = structuredClone(EXAMPLE_RECORDS[0]);
  record.payment.id = "pay_fee_accounting";
  record.settlement = { id: "set_fee_accounting", gross_minor: 249900, fee_minor: 4000, tax_minor: 720, net_minor: 245180, psp_ref: "psp_fee_accounting", settled_on: "2026-08-14T00:00:00.000Z" };
  ingestRecords(user.id, "integration", [record]);
  closeUser(user.id);
  const settled = latestClose(user.id)!.claims.find((claim) => claim.type === "SETTLED");
  assert.equal(settled?.status, "PROVEN");
});

test("Razorpay recon maps real gross, fee, tax, credit, settlement, and UTR evidence", () => {
  assert.deepEqual(settlementFromRazorpayRecon({
    entity_id: "pay_recon", type: "payment", amount: 100000, credit: 97100, fee: 2900, tax: 0,
    currency: "INR", settled: true, settled_at: 1_568_176_960, settlement_id: "setl_real", settlement_utr: "utr_real",
  }), {
    id: "setl_real:pay_recon", gross_minor: 100000, fee_minor: 2900, tax_minor: 0, net_minor: 97100,
    psp_ref: "setl_real/utr_real", settled_on: "2019-09-11T04:42:40.000Z",
  });
});

test("Razorpay refresh preserves richer evidence already attached to the payment", () => {
  const existing = structuredClone(EXAMPLE_RECORDS[0]);
  const fresh = paymentToRecord({ id: existing.payment.id, amount: existing.payment.amount_minor, status: "captured", captured: true, created_at: 1_700_000_000 });
  const merged = mergeRazorpayRecord(existing, fresh);
  assert.equal(merged.ap2_intent?.id, existing.ap2_intent?.id);
  assert.equal(merged.settlement?.id, existing.settlement?.id);
  assert.equal(merged.bank?.id, existing.bank?.id);
});

test("razorpay payment mapping does not invent mandate or settlement evidence", () => {
  const rec = paymentToRecord({
    id: "pay_test1",
    amount: 50000,
    status: "captured",
    captured: true,
    created_at: 1_700_000_000,
    email: "buyer@example.com",
    description: "Widget",
    order_id: "order_1",
    invoice_id: "inv_1",
    notes: { category: "general" },
  });
  const parsed = parseExternalRecord(rec);
  assert.equal(parsed.payment.amount_minor, 50000);
  assert.equal(parsed.ap2_intent, null, "Razorpay payment metadata does not fabricate a mandate");
  assert.equal(parsed.receipt?.stored, true, "a real Razorpay invoice is receipt evidence");
  assert.equal(parsed.settlement, null);
  assert.equal(parsed.bank, null);
});

test("Razorpay payment without bank evidence keeps bank absent", () => {
  const rec = paymentToRecord({
    id: "pay_untagged",
    amount: 1000,
    status: "captured",
    captured: true,
    created_at: 1_700_000_000,
    notes: { untagged: "1" },
  });
  assert.equal(rec.bank, null, "a payment event must not synthesize a bank credit");
});

test("payment-only Razorpay evidence closes with truthful missing-evidence codes", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  const record = paymentToRecord({ id: "pay_only", amount: 1000, status: "captured", captured: true, created_at: 1_700_000_000 });
  ingestRecords(user.id, "razorpay", [record]);
  closeUser(user.id);
  const codes = new Set(latestClose(user.id)!.claims.map((claim) => claim.code));
  assert.ok(codes.has("MANDATE_ATTESTATION_MISSING"));
  assert.ok(codes.has("CART_ATTESTATION_MISSING"));
  assert.ok(codes.has("SETTLEMENT_ABSENT"));
  assert.ok(codes.has("BANK_CREDIT_ABSENT"));
});

test("ingest idempotency is global across source labels", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  const record = paymentToRecord({ id: "pay_same", amount: 1000, status: "captured", captured: true, created_at: 1_700_000_000 });
  assert.equal(ingestRecords(user.id, "browser", [record]).inserted, 1);
  const second = ingestRecords(user.id, "razorpay", [record]);
  assert.deepEqual(second, { inserted: 0, updated: 0, unchanged: 1, total: 1 });
});

test("Razorpay webhook event ids are durably deduplicated", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  const first = enqueueRazorpayWebhook(user.id, "event-1", "{}");
  const second = enqueueRazorpayWebhook(user.id, "event-1", "{}");
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.id, second.id);
});

test("calibration replacement does not silently append stale labels", () => {
  const user = createUser("ops@example.com", "super-secret-12");
  importCalibration(user.id, [{ score: 0, correct: true }]);
  importCalibration(user.id, [{ score: 2, correct: false }]);
  assert.deepEqual(calibrationRows(user.id), [{ score: 2, correct: false }]);
});

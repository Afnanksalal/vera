import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChain,
  chainHead,
  newAuditorKeypair,
  signHead,
  verifyChain,
  verifyHead,
  type AuditEvent,
} from "./audit";
import { buildFixture } from "./fixture";
import { runClose } from "./orchestrate";

function sampleChain(): AuditEvent[] {
  const { world } = buildFixture({ seed: 11 });
  return buildChain(runClose(world));
}

test("a freshly built chain verifies", () => {
  const events = sampleChain();
  assert.ok(events.length > 0);
  assert.deepEqual(verifyChain(events), { ok: true, broken_at: null });
});

test("editing an event payload breaks the chain at that index", () => {
  const events = sampleChain();
  const idx = Math.floor(events.length / 2);
  const tampered = events.map((e, i) =>
    i === idx ? { ...e, payload: { ...e.payload, accepted: !e.payload.accepted } } : e
  );
  const check = verifyChain(tampered);
  assert.equal(check.ok, false);
  assert.equal(check.broken_at, idx);
});

test("deleting an event breaks the chain", () => {
  const events = sampleChain();
  const truncated = [...events.slice(0, 5), ...events.slice(6)];
  assert.equal(verifyChain(truncated).ok, false);
});

test("ed25519 signature over the head round-trips", () => {
  const events = sampleChain();
  const head = chainHead(events);
  const kp = newAuditorKeypair();
  const sig = signHead(kp.privateKeyPem, head);
  assert.equal(verifyHead(kp.publicKeyPem, head, sig), true);
});

test("signature fails against a different head", () => {
  const kp = newAuditorKeypair();
  const sig = signHead(kp.privateKeyPem, "head-a");
  assert.equal(verifyHead(kp.publicKeyPem, "head-b", sig), false);
});

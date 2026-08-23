import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate, EVAL_GATES } from "./eval";
import { buildFixture } from "./fixture";
import { runClose } from "./orchestrate";

test("eval passes every gate on the default seed", () => {
  const report = evaluate({ seed: 42 });
  assert.equal(report.falseProve, 0, "no false proves");
  assert.equal(report.plantedRecall, 1, "all planted faults caught with the right code");
  assert.ok(report.closureRate >= EVAL_GATES.minClosureRate, "closure rate");
  assert.ok(report.claimsProcessed >= EVAL_GATES.minClaims, "claim count");
  assert.equal(report.openOrAbstained.length, 0, "no leftover holes on the happy path");
  assert.equal(report.pass, true);
});

test("naive amount+date baseline misses most planted faults", () => {
  const report = evaluate({ seed: 42 });
  // It can only catch faults that change the bank amount (the untagged lump).
  assert.ok(report.naive.falseClean > report.naive.caught);
  assert.equal(report.naive.caught, 2);
});

test("every planted fault surfaces as its exception code", () => {
  const report = evaluate({ seed: 42 });
  assert.ok(report.exceptionsByCode.MANDATE_OVERSPEND >= 1);
  assert.ok(report.exceptionsByCode.MANDATE_EXPIRED >= 1);
  assert.ok(report.exceptionsByCode.RECEIPT_ABSENT >= 1);
  assert.ok(report.exceptionsByCode.RETRY_DOUBLE_BOOK >= 1);
  assert.ok(report.exceptionsByCode.SETTLEMENT_DRIFT >= 1);
  assert.ok(report.exceptionsByCode.CHANNEL_UNTAGGED >= 1);
  assert.ok(report.exceptionsByCode.CART_PAYMENT_MISMATCH >= 1);
  assert.ok(report.exceptionsByCode.ORPHAN_REFUND >= 1);
  assert.ok(report.exceptionsByCode.DOUBLE_REFUND >= 1);
});

test("eval passes across several seeds (not overfit to 42)", () => {
  for (const seed of [1, 7, 100, 2026]) {
    const report = evaluate({ seed });
    assert.equal(report.falseProve, 0, `seed ${seed} false prove`);
    assert.equal(report.plantedRecall, 1, `seed ${seed} recall`);
    assert.equal(report.pass, true, `seed ${seed} pass`);
  }
});

test("close is deterministic: same seed, same claim statuses", () => {
  const a = runClose(buildFixture({ seed: 5 }).world);
  const b = runClose(buildFixture({ seed: 5 }).world);
  assert.deepEqual(
    a.claims.map((c) => [c.claim_id, c.status, c.code ?? null]),
    b.claims.map((c) => [c.claim_id, c.status, c.code ?? null])
  );
});

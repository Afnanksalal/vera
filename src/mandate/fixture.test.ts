import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256 } from "./canonical";
import { buildFixture, DEFAULT_CONFIG, totalAgentSales } from "./fixture";
import { EXCEPTION_CODES, FAULT_TARGET } from "./types";

test("agent sale count = planted + clean", () => {
  const { world } = buildFixture();
  assert.equal(world.sales.length, totalAgentSales());
});

test("every configured plant is present exactly the configured number of times", () => {
  const { world } = buildFixture();
  for (const code of EXCEPTION_CODES) {
    const count = world.sales.filter((s) => s.fault === code).length;
    assert.equal(count, DEFAULT_CONFIG.plants[code], `plant ${code}`);
  }
});

test("answer key marks exactly the targeted claim EXCEPTED per planted sale", () => {
  const { world, answer_key } = buildFixture();
  for (const sale of world.sales) {
    const entries = answer_key.filter((k) => k.sale_id === sale.sale_id);
    assert.equal(entries.length, 7);
    const excepted = entries.filter((k) => k.expected_status === "EXCEPTED");
    if (sale.fault) {
      assert.equal(excepted.length, 1);
      assert.equal(excepted[0].type, FAULT_TARGET[sale.fault]);
      assert.equal(excepted[0].expected_code, sale.fault);
    } else {
      assert.equal(excepted.length, 0);
    }
  }
});

test("all money is integer paise", () => {
  const { world } = buildFixture();
  const nums: number[] = [
    ...world.carts.map((c) => c.total_paise),
    ...world.payments.map((p) => p.amount_paise),
    ...world.settlements.map((s) => s.net_paise),
    ...world.bank.map((b) => b.amount_paise),
    ...world.intents.map((i) => i.budget_paise),
  ];
  for (const n of nums) assert.ok(Number.isInteger(n), `not integer: ${n}`);
});

test("fixture is deterministic for a given seed", () => {
  const a = buildFixture({ seed: 7 });
  const b = buildFixture({ seed: 7 });
  assert.equal(sha256(a.world), sha256(b.world));
  assert.equal(sha256(a.answer_key), sha256(b.answer_key));
});

test("different seeds produce different worlds", () => {
  const a = buildFixture({ seed: 1 });
  const b = buildFixture({ seed: 2 });
  assert.notEqual(sha256(a.world), sha256(b.world));
});

test("claim count exceeds the 50-record bar", () => {
  const { world } = buildFixture();
  assert.ok(world.sales.length * 7 >= 50);
});

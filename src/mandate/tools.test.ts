import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFixture } from "./fixture";
import { callToolRaw, rowExists, rowIdsOf } from "./tools";
import type { Payment, Receipt, Sale, World } from "./types";

function saleWithFault(world: World, fault: string): Sale {
  const sale = world.sales.find((s) => s.fault === fault);
  assert.ok(sale, `expected a sale with fault ${fault}`);
  return sale;
}

test("get_receipt returns a stored receipt for a clean sale", () => {
  const { world } = buildFixture();
  const clean = world.sales.find((s) => s.fault === null)!;
  const receipt = callToolRaw(world, "get_receipt", { payment_id: clean.payment_id }) as Receipt;
  assert.equal(receipt.stored, true);
});

test("get_receipt shows stored=false on the RECEIPT_ABSENT plant", () => {
  const { world } = buildFixture();
  const sale = saleWithFault(world, "RECEIPT_ABSENT");
  const receipt = callToolRaw(world, "get_receipt", { payment_id: sale.payment_id }) as Receipt;
  assert.equal(receipt.stored, false);
});

test("find_payment_by_idempotency returns 2 on the double-book plant", () => {
  const { world } = buildFixture();
  const sale = saleWithFault(world, "RETRY_DOUBLE_BOOK");
  const payment = callToolRaw(world, "get_payment", { payment_id: sale.payment_id }) as Payment;
  const dup = callToolRaw(world, "find_payment_by_idempotency", {
    idempotency_key: payment.idempotency_key,
  }) as { count: number };
  assert.equal(dup.count, 2);
});

test("verify_intent_sig is valid for generated intents", () => {
  const { world } = buildFixture();
  const sale = world.sales[0];
  const res = callToolRaw(world, "verify_intent_sig", { intent_id: sale.intent_id }) as {
    valid: boolean;
  };
  assert.equal(res.valid, true);
});

test("verify_cart_sig recomputes the hash and matches", () => {
  const { world } = buildFixture();
  const sale = world.sales[0];
  const res = callToolRaw(world, "verify_cart_sig", { cart_id: sale.cart_id }) as {
    valid: boolean;
    hash_match: boolean;
  };
  assert.equal(res.valid, true);
  assert.equal(res.hash_match, true);
});

test("bank_candidates matches on amount + date, not on a lump", () => {
  const { world } = buildFixture();
  const untagged = saleWithFault(world, "CHANNEL_UNTAGGED");
  const payment = callToolRaw(world, "get_payment", { payment_id: untagged.payment_id }) as Payment;
  const settlement = world.settlements.find((s) => s.payment_id === untagged.payment_id)!;
  const cands = callToolRaw(world, "bank_candidates", {
    amount_paise: payment.amount_paise,
    date: settlement.settled_on,
    window_days: 2,
  }) as unknown[];
  assert.equal(cands.length, 0);
});

test("rowIdsOf extracts ids and rowExists confirms them", () => {
  const { world } = buildFixture();
  const sale = world.sales[0];
  const payment = callToolRaw(world, "get_payment", { payment_id: sale.payment_id });
  const ids = rowIdsOf(payment);
  assert.ok(ids.includes(sale.payment_id));
  for (const id of ids) assert.ok(rowExists(world, id));
});

test("rowExists is false for a fabricated id", () => {
  const { world } = buildFixture();
  assert.equal(rowExists(world, "pay_does_not_exist"), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { ingest } from "./adapters";
import { callToolRaw } from "./tools";
import { EXAMPLE_EXPECTATIONS, EXAMPLE_RECORDS } from "./examples";
import { runClose } from "./orchestrate";
import type { Claim } from "./types";

test("ingested intents and carts verify after normalization", () => {
  const world = ingest(EXAMPLE_RECORDS);
  for (const sale of world.sales) {
    const intentSig = callToolRaw(world, "verify_intent_sig", { intent_id: sale.intent_id }) as {
      valid: boolean;
    };
    const cartSig = callToolRaw(world, "verify_cart_sig", { cart_id: sale.cart_id }) as {
      valid: boolean;
      hash_match: boolean;
    };
    assert.equal(intentSig.valid, true, `intent sig ${sale.intent_id}`);
    assert.equal(cartSig.valid, true, `cart sig ${sale.cart_id}`);
    assert.equal(cartSig.hash_match, true, `cart hash ${sale.cart_id}`);
  }
});

test("closing ingested external records surfaces the real faults", () => {
  const world = ingest(EXAMPLE_RECORDS);
  const run = runClose(world);
  const byId = new Map<string, Claim>(run.claims.map((c) => [c.claim_id, c]));

  for (const [saleId, expected] of Object.entries(EXAMPLE_EXPECTATIONS)) {
    const claim = byId.get(`${saleId}:${expected.type}`);
    assert.ok(claim, `missing claim ${saleId}:${expected.type}`);
    assert.equal(claim.status, "EXCEPTED", `${saleId} should be excepted`);
    assert.equal(claim.code, expected.code, `${saleId} code`);
  }
});

test("the clean external sale proves every claim", () => {
  const world = ingest(EXAMPLE_RECORDS);
  const run = runClose(world);
  const clean = run.claims.filter((c) => c.sale_id === "sale_pay_ap2_clean");
  assert.equal(clean.length, 7);
  assert.ok(clean.every((c) => c.status === "PROVEN"), "clean sale fully proven");
});

test("missing x402 receipt remains absent", () => {
  const world = ingest(EXAMPLE_RECORDS);
  const noReceipt = world.sales.find((s) => s.sale_id === "sale_pay_x402_noreceipt")!;
  const receipt = callToolRaw(world, "get_receipt", { payment_id: noReceipt.payment_id });
  assert.equal(receipt, null);
});

test("a forged merchant-signed receipt is rejected", () => {
  const record = structuredClone(EXAMPLE_RECORDS[0]);
  record.receipt = { id: "rcp_forged", stored: true, payload_hash: "a".repeat(64), issued_at: "2026-08-12T09:31:00.000Z", merchant_signature: "forged", merchant_public_key_pem: record.ap2_cart!.merchant_public_key_pem, source: "merchant_signed" };
  const claim = runClose(ingest([record])).claims.find((row) => row.type === "RECEIPTED");
  assert.equal(claim?.status, "EXCEPTED");
  assert.equal(claim?.code, "RECEIPT_ATTESTATION_INVALID");
});

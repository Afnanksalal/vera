import type { ExternalRecord } from "./adapters";

/**
 * Hand-written external payloads in AP2 / ACP / x402 shape. One clean sale and
 * three with real faults, to show the ledger closing non-fixture data.
 */
export const EXAMPLE_RECORDS: ExternalRecord[] = [
  {
    ap2_intent: {
      id: "int_ap2_clean",
      principal_did: "did:example:alice",
      agent_did: "did:agent:shopper-1",
      constraints: {
        budget_minor: 500000,
        category: "electronics",
        valid_from: "2026-08-10T00:00:00.000Z",
        valid_to: "2026-08-16T23:59:59.000Z",
      },
    },
    ap2_cart: {
      id: "crt_ap2_clean",
      intent_id: "int_ap2_clean",
      merchant: "merchant:gizmo",
      items: [{ sku: "USB-C-CHARGER", qty: 1, unit_minor: 249900 }],
      amount_minor: 249900,
    },
    payment: {
      rail: "ap2_card",
      id: "pay_ap2_clean",
      amount_minor: 249900,
      idempotency_key: "idem_ap2_clean",
      created_at: "2026-08-12T09:30:00.000Z",
    },
    receipt: { id: "rcp_ap2_clean", stored: true },
    order: { id: "ord_ap2_clean" },
    settlement: { id: "set_ap2_clean", net_minor: 249900, psp_ref: "psp_clean", settled_on: "2026-08-14T00:00:00.000Z" },
    bank: {
      id: "bnk_ap2_clean",
      amount_minor: 249900,
      date: "2026-08-14T00:00:00.000Z",
      narration: "NEFT CR AGENT SETTLEMENT",
      intent_ref: "int_ap2_clean",
    },
  },
  {
    // Agent overspent the mandate: cart 620000 > budget 500000.
    ap2_intent: {
      id: "int_ap2_over",
      principal_did: "did:example:bob",
      agent_did: "did:agent:shopper-2",
      constraints: {
        budget_minor: 500000,
        category: "travel",
        valid_from: "2026-08-10T00:00:00.000Z",
        valid_to: "2026-08-16T23:59:59.000Z",
      },
    },
    ap2_cart: {
      id: "crt_ap2_over",
      intent_id: "int_ap2_over",
      merchant: "merchant:trips",
      items: [{ sku: "HOTEL-2N", qty: 1, unit_minor: 620000 }],
      amount_minor: 620000,
    },
    payment: {
      rail: "ap2_card",
      id: "pay_ap2_over",
      amount_minor: 620000,
      idempotency_key: "idem_ap2_over",
      created_at: "2026-08-12T10:00:00.000Z",
    },
    receipt: { id: "rcp_ap2_over", stored: true },
    order: { id: "ord_ap2_over" },
    settlement: { id: "set_ap2_over", net_minor: 620000, psp_ref: "psp_over", settled_on: "2026-08-14T00:00:00.000Z" },
    bank: {
      id: "bnk_ap2_over",
      amount_minor: 620000,
      date: "2026-08-14T00:00:00.000Z",
      narration: "NEFT CR AGENT SETTLEMENT",
      intent_ref: "int_ap2_over",
    },
  },
  {
    // x402 machine payment that settled with no durable receipt.
    ap2_intent: {
      id: "int_x402_noreceipt",
      principal_did: "did:example:carol",
      agent_did: "did:agent:api-buyer",
      constraints: {
        budget_minor: 100000,
        category: "office",
        valid_from: "2026-08-10T00:00:00.000Z",
        valid_to: "2026-08-16T23:59:59.000Z",
      },
    },
    ap2_cart: {
      id: "crt_x402_noreceipt",
      intent_id: "int_x402_noreceipt",
      merchant: "merchant:datafeed",
      items: [{ sku: "API-CALLS-10K", qty: 1, unit_minor: 5000 }],
      amount_minor: 5000,
    },
    payment: {
      rail: "x402",
      id: "pay_x402_noreceipt",
      amount_minor: 5000,
      idempotency_key: "idem_x402_noreceipt",
      created_at: "2026-08-11T14:00:00.000Z",
      x402_tx: "0xdeadbeef",
    },
    receipt: null,
    order: { id: "ord_x402_noreceipt" },
    settlement: { id: "set_x402_noreceipt", net_minor: 5000, psp_ref: "psp_x402", settled_on: "2026-08-13T00:00:00.000Z" },
    bank: {
      id: "bnk_x402_noreceipt",
      amount_minor: 5000,
      date: "2026-08-13T00:00:00.000Z",
      narration: "NEFT CR AGENT SETTLEMENT",
      intent_ref: "int_x402_noreceipt",
    },
  },
  {
    // ACP settlement landed in an untagged mixed lump; cannot join to intent.
    ap2_intent: {
      id: "int_acp_untagged",
      principal_did: "did:example:dev",
      agent_did: "did:agent:assistant",
      constraints: {
        budget_minor: 900000,
        category: "apparel",
        valid_from: "2026-08-10T00:00:00.000Z",
        valid_to: "2026-08-16T23:59:59.000Z",
      },
    },
    ap2_cart: {
      id: "crt_acp_untagged",
      intent_id: "int_acp_untagged",
      merchant: "merchant:threads",
      items: [{ sku: "JACKET", qty: 1, unit_minor: 480000 }],
      amount_minor: 480000,
    },
    payment: {
      rail: "acp",
      id: "pay_acp_untagged",
      amount_minor: 480000,
      idempotency_key: "idem_acp_untagged",
      created_at: "2026-08-12T12:00:00.000Z",
      acp_token: "spt_123",
    },
    receipt: { id: "rcp_acp_untagged", stored: true },
    order: { id: "ord_acp_untagged" },
    settlement: { id: "set_acp_untagged", net_minor: 480000, psp_ref: "psp_acp", settled_on: "2026-08-14T00:00:00.000Z" },
    bank: {
      id: "bnk_acp_lump",
      amount_minor: 999999,
      date: "2026-08-14T00:00:00.000Z",
      narration: "NEFT CR MIXED CARD SETTLEMENT",
      intent_ref: null,
    },
  },
];

export const EXAMPLE_EXPECTATIONS: Record<string, { type: string; code: string }> = {
  sale_ext_1: { type: "AUTHORIZED", code: "MANDATE_OVERSPEND" },
  sale_ext_2: { type: "RECEIPTED", code: "RECEIPT_ABSENT" },
  sale_ext_3: { type: "BANKED", code: "CHANNEL_UNTAGGED" },
};

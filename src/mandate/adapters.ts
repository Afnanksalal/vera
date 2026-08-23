import { hmacSign, sha256 } from "./canonical";
import type {
  CartLine,
  CartMandate,
  IntentMandate,
  Payment,
  Rail,
  Receipt,
  Refund,
  RefundInitiator,
  Sale,
  Settlement,
  World,
} from "./types";

/**
 * External protocol payloads as a merchant actually receives them. Field names
 * follow AP2 / ACP / x402 conventions; amounts are in minor units (paise).
 */
export type ExternalRecord = {
  ap2_intent: {
    id: string;
    principal_did: string;
    agent_did: string;
    constraints: {
      budget_minor: number;
      category: string;
      valid_from: string;
      valid_to: string;
    };
  };
  ap2_cart: {
    id: string;
    intent_id: string;
    merchant: string;
    items: { sku: string; qty: number; unit_minor: number }[];
    amount_minor: number;
  };
  payment: {
    rail: string;
    id: string;
    amount_minor: number;
    idempotency_key: string;
    created_at: string;
    x402_tx?: string;
    acp_token?: string;
  };
  receipt: { id: string; stored: boolean } | null;
  order: { id: string };
  settlement: { id: string; net_minor: number; psp_ref: string; settled_on: string };
  bank: { id: string; amount_minor: number; date: string; narration: string; intent_ref: string | null } | null;
  refunds?: {
    id: string;
    amount_minor: number;
    initiator: string;
    mandate_ref: string | null;
  }[];
  extra_payments?: {
    id: string;
    rail: string;
    amount_minor: number;
    idempotency_key: string;
    created_at: string;
  }[];
};

export type IngestOptions = {
  seed?: number;
  weekStart?: string;
};

function railOf(raw: string): Rail {
  if (raw === "acp" || raw === "ap2_card" || raw === "x402") return raw;
  if (raw.includes("x402")) return "x402";
  if (raw.includes("card")) return "ap2_card";
  return "acp";
}

function initiatorOf(raw: string): RefundInitiator {
  if (raw === "chargeback" || raw === "agent_cs" || raw === "human") return raw;
  if (raw.includes("charge")) return "chargeback";
  if (raw.includes("agent")) return "agent_cs";
  return "human";
}

function deriveKey(namespace: string, id: string): string {
  // Deterministic per-identity key so ingested signatures verify reproducibly.
  return sha256({ namespace, id }).slice(0, 32);
}

/**
 * Normalize external protocol records into a canonical, internally-signed World.
 * Signatures and cart hashes are (re)computed so the ledger's verify tools work
 * on real data exactly as they do on the fixture. Faults in the input (an
 * overspent budget, a missing receipt, an untagged bank credit) carry through
 * as field values and are caught by the close.
 */
export function ingest(records: ExternalRecord[], opts: IngestOptions = {}): World {
  const world: World = {
    seed: opts.seed ?? -1,
    week_start: opts.weekStart ?? "1970-01-01",
    keys: { principals: {}, merchants: {} },
    principals: [],
    merchants: [],
    agents: [],
    intents: [],
    carts: [],
    payments: [],
    receipts: [],
    orders: [],
    settlements: [],
    bank: [],
    refunds: [],
    sales: [],
  };

  const seenPrincipal = new Set<string>();
  const seenMerchant = new Set<string>();
  const seenAgent = new Set<string>();

  records.forEach((rec, index) => {
    const principal_id = rec.ap2_intent.principal_did;
    const agent_id = rec.ap2_intent.agent_did;
    const merchant_id = rec.ap2_cart.merchant;

    if (!seenPrincipal.has(principal_id)) {
      seenPrincipal.add(principal_id);
      world.principals.push({ principal_id, name: principal_id });
      world.keys.principals[principal_id] = deriveKey("principal", principal_id);
    }
    if (!seenAgent.has(agent_id)) {
      seenAgent.add(agent_id);
      world.agents.push({ agent_id, principal_id });
    }
    if (!seenMerchant.has(merchant_id)) {
      seenMerchant.add(merchant_id);
      world.merchants.push({ merchant_id, name: merchant_id });
      world.keys.merchants[merchant_id] = deriveKey("merchant", merchant_id);
    }

    const intentPayload = {
      intent_id: rec.ap2_intent.id,
      principal_id,
      agent_id,
      category: rec.ap2_intent.constraints.category,
      budget_paise: rec.ap2_intent.constraints.budget_minor,
      not_before: rec.ap2_intent.constraints.valid_from,
      not_after: rec.ap2_intent.constraints.valid_to,
    };
    const intent: IntentMandate = {
      ...intentPayload,
      signature: hmacSign(world.keys.principals[principal_id], intentPayload),
    };
    world.intents.push(intent);

    const lines: CartLine[] = rec.ap2_cart.items.map((it) => ({
      sku: it.sku,
      qty: it.qty,
      unit_paise: it.unit_minor,
    }));
    const cartHashPayload = {
      intent_id: rec.ap2_cart.intent_id,
      merchant_id,
      category: intent.category,
      lines,
      total_paise: rec.ap2_cart.amount_minor,
    };
    const cart_hash = sha256(cartHashPayload);
    const cart: CartMandate = {
      cart_id: rec.ap2_cart.id,
      intent_id: rec.ap2_cart.intent_id,
      merchant_id,
      category: intent.category,
      lines,
      total_paise: rec.ap2_cart.amount_minor,
      cart_hash,
      merchant_sig: hmacSign(world.keys.merchants[merchant_id], {
        cart_id: rec.ap2_cart.id,
        cart_hash,
      }),
    };
    world.carts.push(cart);

    const payment: Payment = {
      payment_id: rec.payment.id,
      cart_id: rec.ap2_cart.id,
      rail: railOf(rec.payment.rail),
      amount_paise: rec.payment.amount_minor,
      idempotency_key: rec.payment.idempotency_key,
      paid_at: rec.payment.created_at,
    };
    world.payments.push(payment);

    for (const extra of rec.extra_payments ?? []) {
      world.payments.push({
        payment_id: extra.id,
        cart_id: rec.ap2_cart.id,
        rail: railOf(extra.rail),
        amount_paise: extra.amount_minor,
        idempotency_key: extra.idempotency_key,
        paid_at: extra.created_at,
      });
    }

    const receipt: Receipt = rec.receipt
      ? {
          receipt_id: rec.receipt.id,
          payment_id: rec.payment.id,
          payload_hash: rec.receipt.stored ? sha256({ payment_id: rec.payment.id }) : "",
          stored: rec.receipt.stored,
        }
      : {
          receipt_id: `rcp_missing_${index}`,
          payment_id: rec.payment.id,
          payload_hash: "",
          stored: false,
        };
    world.receipts.push(receipt);

    world.orders.push({ order_id: rec.order.id, cart_id: rec.ap2_cart.id, payment_id: rec.payment.id });

    const settlement: Settlement = {
      settlement_id: rec.settlement.id,
      payment_id: rec.payment.id,
      net_paise: rec.settlement.net_minor,
      psp_ref: rec.settlement.psp_ref,
      settled_on: rec.settlement.settled_on,
    };
    world.settlements.push(settlement);

    if (rec.bank) {
      world.bank.push({
        bank_id: rec.bank.id,
        amount_paise: rec.bank.amount_minor,
        date: rec.bank.date,
        narration: rec.bank.narration,
        intent_id: rec.bank.intent_ref,
      });
    }

    for (const r of rec.refunds ?? []) {
      const refund: Refund = {
        refund_id: r.id,
        payment_id: rec.payment.id,
        amount_paise: r.amount_minor,
        initiator: initiatorOf(r.initiator),
        mandate_ref: r.mandate_ref,
      };
      world.refunds.push(refund);
    }

    const sale: Sale = {
      sale_id: `sale_ext_${index}`,
      intent_id: rec.ap2_intent.id,
      cart_id: rec.ap2_cart.id,
      payment_id: rec.payment.id,
      order_id: rec.order.id,
      settlement_id: rec.settlement.id,
      fault: null,
    };
    world.sales.push(sale);
  });

  return world;
}

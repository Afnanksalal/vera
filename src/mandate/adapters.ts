import { sha256 } from "./canonical";
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
  sale_id?: string;
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
    signature?: string;
    public_key_pem?: string;
  } | null;
  ap2_cart: {
    id: string;
    intent_id: string;
    merchant: string;
    items: { sku: string; qty: number; unit_minor: number }[];
    amount_minor: number;
    cart_hash?: string;
    merchant_signature?: string;
    merchant_public_key_pem?: string;
  } | null;
  payment: {
    rail: string;
    id: string;
    amount_minor: number;
    idempotency_key: string;
    created_at: string;
    x402_tx?: string;
    acp_token?: string;
  };
  receipt: {
    id: string;
    stored: boolean;
    payload_hash?: string;
    issued_at?: string;
    merchant_signature?: string;
    merchant_public_key_pem?: string;
    source?: "merchant_signed" | "razorpay_invoice" | "integration";
  } | null;
  order: { id: string } | null;
  settlement: {
    id: string;
    gross_minor?: number;
    fee_minor?: number;
    tax_minor?: number;
    net_minor: number;
    psp_ref: string;
    settled_on: string;
    source?: "razorpay_recon" | "processor_api" | "processor_report" | "integration";
    source_hash?: string;
  } | null;
  bank: {
    id: string;
    amount_minor: number;
    date: string;
    narration: string;
    intent_ref: string | null;
    utr?: string;
    source?: "bank_statement" | "bank_api" | "integration";
    source_hash?: string;
  } | null;
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

function railOf(raw: string): Rail {
  if (raw === "acp" || raw === "ap2_card" || raw === "x402") return raw;
  throw new Error(`Unsupported payment rail: ${raw}`);
}

function initiatorOf(raw: string): RefundInitiator {
  if (raw === "chargeback" || raw === "agent_cs" || raw === "human" || raw === "unknown") return raw;
  if (raw.includes("charge")) return "chargeback";
  if (raw.includes("agent")) return "agent_cs";
  return "unknown";
}

/**
 * Normalize external protocol records without manufacturing attestations.
 * Provided public keys and signatures are retained and verified over Vera's
 * canonical payload. Missing attestations remain invalid evidence.
 */
export function ingest(records: ExternalRecord[]): World {
  const world: World = {
    seed: null,
    week_start: null,
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

  records.forEach((rec) => {
    const principal_id = rec.ap2_intent?.principal_did ?? null;
    const agent_id = rec.ap2_intent?.agent_did ?? null;
    const merchant_id = rec.ap2_cart?.merchant ?? null;

    if (principal_id && !seenPrincipal.has(principal_id)) {
      seenPrincipal.add(principal_id);
      world.principals.push({ principal_id, name: principal_id });
      world.keys.principals[principal_id] = rec.ap2_intent?.public_key_pem ?? "";
    }
    if (agent_id && principal_id && !seenAgent.has(agent_id)) {
      seenAgent.add(agent_id);
      world.agents.push({ agent_id, principal_id });
    }
    if (merchant_id && !seenMerchant.has(merchant_id)) {
      seenMerchant.add(merchant_id);
      world.merchants.push({ merchant_id, name: merchant_id });
      world.keys.merchants[merchant_id] = rec.ap2_cart?.merchant_public_key_pem ?? "";
    }

    if (rec.ap2_intent && principal_id && agent_id) {
      const intentPayload = {
        intent_id: rec.ap2_intent.id,
        principal_id,
        agent_id,
        category: rec.ap2_intent.constraints.category,
        budget_paise: rec.ap2_intent.constraints.budget_minor,
        not_before: rec.ap2_intent.constraints.valid_from,
        not_after: rec.ap2_intent.constraints.valid_to,
      };
      const intent: IntentMandate = { ...intentPayload, signature: rec.ap2_intent.signature ?? "" };
      world.intents.push(intent);
    }

    if (rec.ap2_cart && merchant_id) {
      const lines: CartLine[] = rec.ap2_cart.items.map((it) => ({ sku: it.sku, qty: it.qty, unit_paise: it.unit_minor }));
      const cart: CartMandate = {
        cart_id: rec.ap2_cart.id,
        intent_id: rec.ap2_cart.intent_id,
        merchant_id,
        category: rec.ap2_intent?.constraints.category ?? "",
        lines,
        total_paise: rec.ap2_cart.amount_minor,
        cart_hash: rec.ap2_cart.cart_hash ?? "",
        merchant_sig: rec.ap2_cart.merchant_signature ?? "",
      };
      world.carts.push(cart);
    }

    const payment: Payment = {
      payment_id: rec.payment.id,
      cart_id: rec.ap2_cart?.id ?? null,
      rail: railOf(rec.payment.rail),
      amount_paise: rec.payment.amount_minor,
      idempotency_key: rec.payment.idempotency_key,
      paid_at: rec.payment.created_at,
    };
    world.payments.push(payment);

    for (const extra of rec.extra_payments ?? []) {
      world.payments.push({
        payment_id: extra.id,
        cart_id: rec.ap2_cart?.id ?? null,
        rail: railOf(extra.rail),
        amount_paise: extra.amount_minor,
        idempotency_key: extra.idempotency_key,
        paid_at: extra.created_at,
      });
    }

    if (rec.receipt) {
      const receipt: Receipt = {
        receipt_id: rec.receipt.id,
        payment_id: rec.payment.id,
        payload_hash: rec.receipt.payload_hash ?? (rec.receipt.stored ? sha256({ payment_id: rec.payment.id }) : ""),
        stored: rec.receipt.stored,
        issued_at: rec.receipt.issued_at ?? null,
        merchant_sig: rec.receipt.merchant_signature ?? "",
        merchant_public_key_pem: rec.receipt.merchant_public_key_pem ?? "",
        source: rec.receipt.source ?? "integration",
      };
      world.receipts.push(receipt);
    }

    if (rec.order && rec.ap2_cart) {
      world.orders.push({ order_id: rec.order.id, cart_id: rec.ap2_cart.id, payment_id: rec.payment.id });
    }

    if (rec.settlement) {
      const settlement: Settlement = {
        settlement_id: rec.settlement.id,
        payment_id: rec.payment.id,
        gross_paise: rec.settlement.gross_minor ?? rec.payment.amount_minor,
        fee_paise: rec.settlement.fee_minor ?? 0,
        tax_paise: rec.settlement.tax_minor ?? 0,
        net_paise: rec.settlement.net_minor,
        psp_ref: rec.settlement.psp_ref,
        settled_on: rec.settlement.settled_on,
        source: rec.settlement.source ?? "integration",
        source_hash: rec.settlement.source_hash ?? "",
      };
      world.settlements.push(settlement);
    }

    if (rec.bank) {
      world.bank.push({
        bank_id: rec.bank.id,
        amount_paise: rec.bank.amount_minor,
        date: rec.bank.date,
        narration: rec.bank.narration,
        intent_id: rec.bank.intent_ref,
        utr: rec.bank.utr ?? "",
        source: rec.bank.source ?? "integration",
        source_hash: rec.bank.source_hash ?? "",
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
      sale_id: rec.sale_id || `sale_${rec.payment.id}`,
      intent_id: rec.ap2_intent?.id ?? null,
      cart_id: rec.ap2_cart?.id ?? null,
      payment_id: rec.payment.id,
      order_id: rec.order?.id ?? null,
      settlement_id: rec.settlement?.id ?? null,
      fault: null,
    };
    world.sales.push(sale);
  });

  return world;
}

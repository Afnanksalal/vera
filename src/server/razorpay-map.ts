import type { ExternalRecord } from "@/mandate/adapters";

export type RazorpayPaymentLike = {
  id: string;
  amount: number;
  currency?: string;
  status: string;
  method?: string | null;
  description?: string | null;
  email?: string | null;
  contact?: string | null;
  notes?: Record<string, string> | string[] | null;
  created_at: number;
  order_id?: string | null;
  invoice_id?: string | null;
  captured?: boolean;
};

export type RazorpayRefundLike = {
  id: string;
  payment_id: string;
  amount: number;
  notes?: Record<string, string> | string[] | null;
  created_at?: number;
};

function notesMap(notes: RazorpayPaymentLike["notes"]): Record<string, string> {
  if (!notes || Array.isArray(notes)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(notes)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function iso(unix: number): string {
  if (!Number.isSafeInteger(unix) || unix <= 0) throw new Error("Razorpay timestamp is invalid.");
  return new Date(unix * 1000).toISOString();
}

function finiteInt(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validDate(value: string | undefined): string | null {
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * Map a Razorpay payment without inventing evidence. Mandate metadata may be
 * carried in order/payment notes by the originating agent integration. Missing
 * authorization, receipt, settlement, and bank evidence remains missing and is
 * surfaced by the verifier instead of being synthesized from the charge.
 */
export function paymentToRecord(p: RazorpayPaymentLike, refunds: RazorpayRefundLike[] = []): ExternalRecord {
  const notes = notesMap(p.notes);
  const amount = Number(p.amount);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Razorpay amount is not integer paise.");
  if (p.currency && p.currency !== "INR") throw new Error(`Unsupported Razorpay currency: ${p.currency}. Vera's ledger is INR/paise only.`);
  const paidAt = iso(p.created_at);
  const intentId = notes.intent_id || notes.mandate_id || null;
  const budget = finiteInt(notes.budget_paise);
  const validFrom = validDate(notes.valid_from);
  const validTo = validDate(notes.valid_to);
  const hasIntent = Boolean(intentId && notes.principal_did && notes.agent_did && notes.category && budget !== null && validFrom && validTo);
  const cartAmount = finiteInt(notes.cart_amount_paise);
  const itemQty = finiteInt(notes.item_qty);
  const itemUnit = finiteInt(notes.item_unit_paise);
  const hasCart = Boolean(
    notes.cart_id && intentId && notes.merchant && notes.sku && cartAmount !== null && itemQty && itemUnit !== null
  );
  const receiptId = p.invoice_id || notes.receipt_id || null;
  const receiptStored = Boolean(p.invoice_id) || notes.receipt_stored === "1" || notes.receipt_stored === "true";

  return {
    sale_id: `sale_rzp_${p.id}`,
    ap2_intent: hasIntent ? {
      id: intentId!,
      principal_did: notes.principal_did,
      agent_did: notes.agent_did,
      constraints: {
        budget_minor: budget!,
        category: notes.category,
        valid_from: validFrom!,
        valid_to: validTo!,
      },
      signature: notes.intent_signature,
      public_key_pem: notes.intent_public_key_pem,
    } : null,
    ap2_cart: hasCart ? {
      id: notes.cart_id,
      intent_id: intentId!,
      merchant: notes.merchant,
      items: [{ sku: notes.sku, qty: itemQty!, unit_minor: itemUnit! }],
      amount_minor: cartAmount!,
      cart_hash: notes.cart_hash,
      merchant_signature: notes.cart_signature,
      merchant_public_key_pem: notes.cart_public_key_pem,
    } : null,
    payment: {
      rail: "ap2_card",
      id: p.id,
      amount_minor: amount,
      idempotency_key: notes.idempotency_key || p.order_id || p.id,
      created_at: paidAt,
    },
    receipt: receiptId ? { id: receiptId, stored: receiptStored } : null,
    order: p.order_id ? { id: p.order_id } : null,
    settlement: null,
    bank: null,
    refunds: refunds.map((r) => {
      const refundAmount = Number(r.amount);
      if (!Number.isSafeInteger(refundAmount) || refundAmount < 0) throw new Error(`Razorpay refund ${r.id} has an invalid amount.`);
      return {
        id: r.id,
        amount_minor: refundAmount,
        initiator: notesMap(r.notes).initiator || "unknown",
        mandate_ref: notesMap(r.notes).mandate_ref ?? null,
      };
    }),
  };
}

import type { ExternalRecord } from "@/mandate/adapters";
import { HttpError } from "./http";

function intPaise(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(400, `${field} must be a non-negative integer (paise).`, "invalid_record");
  }
  return value;
}

function dateStr(value: unknown, field: string): string {
  const parsed = str(value, field);
  if (!Number.isFinite(Date.parse(parsed))) {
    throw new HttpError(400, `${field} must be a valid ISO-8601 date or timestamp.`, "invalid_record");
  }
  return parsed;
}

function str(value: unknown, field: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new HttpError(400, `${field} must be a non-empty string.`, "invalid_record");
  }
  return value;
}

function optStr(value: unknown, field: string, max = 256): string | undefined {
  if (value === undefined) return undefined;
  return str(value, field, max);
}

function paymentRail(value: unknown, field = "payment.rail"): "acp" | "ap2_card" | "x402" {
  const parsed = str(value, field);
  if (parsed !== "acp" && parsed !== "ap2_card" && parsed !== "x402") {
    throw new HttpError(400, `${field} must be acp, ap2_card, or x402.`, "invalid_record");
  }
  return parsed;
}

/** Strict parse so garbage JSON cannot reach the verifier. */
export function parseExternalRecord(raw: unknown): ExternalRecord {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "Each record must be an object.", "invalid_record");
  const rec = raw as Record<string, unknown>;
  const intent = rec.ap2_intent as Record<string, unknown> | undefined;
  const constraints = intent?.constraints as Record<string, unknown> | undefined;
  const cart = rec.ap2_cart as Record<string, unknown> | undefined;
  const payment = rec.payment as Record<string, unknown> | undefined;
  const order = rec.order as Record<string, unknown> | undefined;
  const settlement = rec.settlement as Record<string, unknown> | undefined;
  if (!payment) {
    throw new HttpError(400, "Record is missing its payment object.", "invalid_record");
  }
  if (intent && !constraints) {
    throw new HttpError(400, "AP2 intent is missing constraints.", "invalid_record");
  }
  if (constraints) {
    const from = dateStr(constraints.valid_from, "valid_from");
    const to = dateStr(constraints.valid_to, "valid_to");
    if (Date.parse(from) > Date.parse(to)) {
      throw new HttpError(400, "Intent validity start must not be after its end.", "invalid_record");
    }
  }
  const itemsRaw: unknown = cart?.items;
  if (cart && (!Array.isArray(itemsRaw) || itemsRaw.length === 0)) {
    throw new HttpError(400, "Cart must contain at least one item.", "invalid_record");
  }
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((item: unknown, i: number) => {
    const row = item as Record<string, unknown>;
    const qty = intPaise(row.qty, `items[${i}].qty`);
    if (qty < 1) throw new HttpError(400, "Item qty must be >= 1.", "invalid_record");
    return {
      sku: str(row.sku, `items[${i}].sku`),
      qty,
      unit_minor: intPaise(row.unit_minor, `items[${i}].unit_minor`),
    };
  });

  const receiptRaw = rec.receipt;
  let receipt: ExternalRecord["receipt"] = null;
  if (receiptRaw && typeof receiptRaw === "object") {
    const r = receiptRaw as Record<string, unknown>;
    receipt = { id: str(r.id, "receipt.id"), stored: Boolean(r.stored) };
  }

  const bankRaw = rec.bank;
  let bank: ExternalRecord["bank"] = null;
  if (bankRaw && typeof bankRaw === "object") {
    const b = bankRaw as Record<string, unknown>;
    bank = {
      id: str(b.id, "bank.id"),
      amount_minor: intPaise(b.amount_minor, "bank.amount_minor"),
      date: dateStr(b.date, "bank.date"),
      narration: str(b.narration, "bank.narration", 512),
      intent_ref: b.intent_ref === null ? null : str(b.intent_ref, "bank.intent_ref"),
    };
  }

  const refunds = Array.isArray(rec.refunds)
    ? rec.refunds.map((row, i) => {
        const r = row as Record<string, unknown>;
        return {
          id: str(r.id, `refunds[${i}].id`),
          amount_minor: intPaise(r.amount_minor, `refunds[${i}].amount_minor`),
          initiator: str(r.initiator, `refunds[${i}].initiator`),
          mandate_ref: r.mandate_ref === null ? null : str(r.mandate_ref, `refunds[${i}].mandate_ref`),
        };
      })
    : undefined;

  const extra_payments = Array.isArray(rec.extra_payments)
    ? rec.extra_payments.map((row, i) => {
        const p = row as Record<string, unknown>;
        return {
          id: str(p.id, `extra_payments[${i}].id`),
          rail: paymentRail(p.rail, `extra_payments[${i}].rail`),
          amount_minor: intPaise(p.amount_minor, `extra_payments[${i}].amount_minor`),
          idempotency_key: str(p.idempotency_key, `extra_payments[${i}].idempotency_key`),
          created_at: dateStr(p.created_at, `extra_payments[${i}].created_at`),
        };
      })
    : undefined;

  return {
    sale_id: optStr(rec.sale_id, "sale_id"),
    ap2_intent: intent && constraints ? {
      id: str(intent.id, "ap2_intent.id"),
      principal_did: str(intent.principal_did, "ap2_intent.principal_did"),
      agent_did: str(intent.agent_did, "ap2_intent.agent_did"),
      constraints: {
        budget_minor: intPaise(constraints.budget_minor, "budget_minor"),
        category: str(constraints.category, "category"),
      valid_from: dateStr(constraints.valid_from, "valid_from"),
      valid_to: dateStr(constraints.valid_to, "valid_to"),
      },
      signature: optStr(intent.signature, "ap2_intent.signature", 2048),
      public_key_pem: optStr(intent.public_key_pem, "ap2_intent.public_key_pem", 4096),
    } : null,
    ap2_cart: cart ? {
      id: str(cart.id, "ap2_cart.id"),
      intent_id: str(cart.intent_id, "ap2_cart.intent_id"),
      merchant: str(cart.merchant, "merchant"),
      items,
      amount_minor: intPaise(cart.amount_minor, "ap2_cart.amount_minor"),
      cart_hash: optStr(cart.cart_hash, "ap2_cart.cart_hash", 128),
      merchant_signature: optStr(cart.merchant_signature, "ap2_cart.merchant_signature", 2048),
      merchant_public_key_pem: optStr(cart.merchant_public_key_pem, "ap2_cart.merchant_public_key_pem", 4096),
    } : null,
    payment: {
      rail: paymentRail(payment.rail),
      id: str(payment.id, "payment.id"),
      amount_minor: intPaise(payment.amount_minor, "payment.amount_minor"),
      idempotency_key: str(payment.idempotency_key, "payment.idempotency_key"),
      created_at: dateStr(payment.created_at, "payment.created_at"),
      x402_tx: optStr(payment.x402_tx, "x402_tx"),
      acp_token: optStr(payment.acp_token, "acp_token"),
    },
    receipt,
    order: order ? { id: str(order.id, "order.id") } : null,
    settlement: settlement ? {
      id: str(settlement.id, "settlement.id"),
      gross_minor: settlement.gross_minor === undefined ? undefined : intPaise(settlement.gross_minor, "settlement.gross_minor"),
      fee_minor: settlement.fee_minor === undefined ? undefined : intPaise(settlement.fee_minor, "settlement.fee_minor"),
      tax_minor: settlement.tax_minor === undefined ? undefined : intPaise(settlement.tax_minor, "settlement.tax_minor"),
      net_minor: intPaise(settlement.net_minor, "settlement.net_minor"),
      psp_ref: str(settlement.psp_ref, "psp_ref"),
      settled_on: dateStr(settlement.settled_on, "settled_on"),
    } : null,
    bank,
    refunds,
    extra_payments,
  };
}

export function parseRecordList(raw: unknown): ExternalRecord[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "Body.records must be an array.", "invalid_record");
  return raw.map(parseExternalRecord);
}

import { callToolRaw } from "./tools";
import type { Decision, Sale, World } from "./types";

/** Settlement lands T+2; a bank credit for a settlement can appear a day either side. */
export const BANK_WINDOW_DAYS = 2;

type CartRow = { total_paise: number };
type PaymentRow = { amount_paise: number; idempotency_key: string; paid_at: string };
type SettlementRow = { gross_paise: number; fee_paise: number; tax_paise: number; net_paise: number; settled_on: string };
type ReceiptRow = { stored: boolean } | null;
type RefundRow = { initiator: string; mandate_ref: string | null };
type BankRow = { amount_paise: number; intent_id: string | null };
type WithinRow =
  | { found: false }
  | { found: true; withinBudget: boolean; categoryMatch: boolean; withinTime: boolean };

/**
 * The auditor logic. Given raw world data (via tools), decide whether a claim
 * should be PROVEN or EXCEPTED, and with which code. Pure and deterministic.
 * The verifier runs this on raw data; the closer runs it to build a proposal.
 */
export function decideClaim(world: World, sale: Sale, type: string): Decision {
  const call = (tool: Parameters<typeof callToolRaw>[1], args: Record<string, unknown>) =>
    callToolRaw(world, tool, args);

  switch (type) {
    case "AUTHORIZED": {
      if (!sale.intent_id || !sale.cart_id) {
        return { action: "except", code: "MANDATE_ATTESTATION_MISSING" };
      }
      const sig = call("verify_intent_sig", { intent_id: sale.intent_id }) as {
        found: boolean;
        valid: boolean;
        has_key?: boolean;
        has_signature?: boolean;
      };
      if (!sig.found || !sig.has_key || !sig.has_signature) {
        return { action: "except", code: "MANDATE_ATTESTATION_MISSING" };
      }
      if (!sig.valid) return { action: "except", code: "MANDATE_ATTESTATION_INVALID" };
      const within = call("cart_within_intent", {
        cart_id: sale.cart_id,
        intent_id: sale.intent_id,
        payment_id: sale.payment_id,
      }) as WithinRow;
      if (!within.found) return { action: "except", code: "MANDATE_OVERSPEND" };
      if (!within.withinBudget || !within.categoryMatch) {
        return { action: "except", code: "MANDATE_OVERSPEND" };
      }
      if (!within.withinTime) return { action: "except", code: "MANDATE_EXPIRED" };
      return { action: "prove" };
    }

    case "CART_BOUND": {
      if (!sale.cart_id) return { action: "except", code: "CART_ATTESTATION_MISSING" };
      const cartSig = call("verify_cart_sig", { cart_id: sale.cart_id }) as {
        found: boolean;
        valid: boolean;
        hash_match: boolean;
        has_key?: boolean;
        has_signature?: boolean;
        has_hash?: boolean;
        line_total_match?: boolean;
      };
      const cart = call("get_cart", { cart_id: sale.cart_id }) as CartRow | null;
      const payment = call("get_payment", { payment_id: sale.payment_id }) as PaymentRow | null;
      if (!cartSig.found || !cartSig.has_key || !cartSig.has_signature || !cartSig.has_hash) {
        return { action: "except", code: "CART_ATTESTATION_MISSING" };
      }
      if (!cartSig.valid || !cartSig.hash_match) {
        return { action: "except", code: "CART_ATTESTATION_INVALID" };
      }
      if (!cartSig.line_total_match) return { action: "except", code: "CART_PAYMENT_MISMATCH" };
      if (!cart || !payment) {
        return { action: "except", code: "CART_PAYMENT_MISMATCH" };
      }
      if (payment.amount_paise !== cart.total_paise) {
        return { action: "except", code: "CART_PAYMENT_MISMATCH" };
      }
      return { action: "prove" };
    }

    case "RECEIPTED": {
      const receipt = call("get_receipt", { payment_id: sale.payment_id }) as ReceiptRow;
      if (!receipt || !receipt.stored) return { action: "except", code: "RECEIPT_ABSENT" };
      return { action: "prove" };
    }

    case "IDEMPOTENT": {
      const payment = call("get_payment", { payment_id: sale.payment_id }) as PaymentRow | null;
      if (!payment) return { action: "except", code: "RETRY_DOUBLE_BOOK" };
      const dup = call("find_payment_by_idempotency", {
        idempotency_key: payment.idempotency_key,
      }) as { count: number };
      if (dup.count > 1) return { action: "except", code: "RETRY_DOUBLE_BOOK" };
      return { action: "prove" };
    }

    case "SETTLED": {
      const payment = call("get_payment", { payment_id: sale.payment_id }) as PaymentRow | null;
      const settlement = call("settlement_for_payment", {
        payment_id: sale.payment_id,
      }) as SettlementRow | null;
      if (!payment || !settlement) return { action: "except", code: "SETTLEMENT_ABSENT" };
      const expectedNet = settlement.gross_paise - settlement.fee_paise - settlement.tax_paise;
      if (settlement.gross_paise !== payment.amount_paise || expectedNet < 0 || settlement.net_paise !== expectedNet) {
        return { action: "except", code: "SETTLEMENT_DRIFT" };
      }
      return { action: "prove" };
    }

    case "BANKED": {
      const payment = call("get_payment", { payment_id: sale.payment_id }) as PaymentRow | null;
      const settlement = call("settlement_for_payment", {
        payment_id: sale.payment_id,
      }) as SettlementRow | null;
      if (!payment || !settlement) return { action: "except", code: "BANK_CREDIT_ABSENT" };
      const candidates = call("bank_candidates", {
        amount_paise: payment.amount_paise,
        date: settlement.settled_on,
        window_days: BANK_WINDOW_DAYS,
      }) as BankRow[];
      const tagged = candidates.filter((b) => b.intent_id === sale.intent_id);
      if (tagged.length === 1) return { action: "prove" };
      if (candidates.length === 0) {
        const nearby = call("bank_lines_in_window", {
          date: settlement.settled_on,
          window_days: BANK_WINDOW_DAYS,
        }) as BankRow[];
        if (nearby.length === 0) return { action: "except", code: "BANK_CREDIT_ABSENT" };
      }
      return { action: "except", code: "CHANNEL_UNTAGGED" };
    }

    case "REFUND_POLICY": {
      const refunds = call("refunds_for_payment", { payment_id: sale.payment_id }) as RefundRow[];
      if (refunds.length === 0) return { action: "prove" };
      if (refunds.some((r) => r.mandate_ref === null)) {
        return { action: "except", code: "ORPHAN_REFUND" };
      }
      const hasChargeback = refunds.some((r) => r.initiator === "chargeback");
      const hasOther = refunds.some((r) => r.initiator !== "chargeback");
      if (hasChargeback && hasOther) return { action: "except", code: "DOUBLE_REFUND" };
      return { action: "prove" };
    }

    default:
      throw new Error(`decideClaim: unknown claim type ${type}`);
  }
}

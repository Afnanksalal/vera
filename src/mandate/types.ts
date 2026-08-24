/** All money is integer paise. No floats anywhere in the ledger. */
export type Paise = number;

export type Rail = "acp" | "ap2_card" | "x402";

export type RefundInitiator = "agent_cs" | "human" | "chargeback" | "unknown";

export const CLAIM_TYPES = [
  "AUTHORIZED",
  "CART_BOUND",
  "RECEIPTED",
  "IDEMPOTENT",
  "SETTLED",
  "BANKED",
  "REFUND_POLICY",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

export const EXCEPTION_CODES = [
  "MANDATE_ATTESTATION_MISSING",
  "MANDATE_ATTESTATION_INVALID",
  "MANDATE_OVERSPEND",
  "MANDATE_EXPIRED",
  "CART_ATTESTATION_MISSING",
  "CART_ATTESTATION_INVALID",
  "CART_PAYMENT_MISMATCH",
  "RECEIPT_ABSENT",
  "RETRY_DOUBLE_BOOK",
  "SETTLEMENT_ABSENT",
  "SETTLEMENT_DRIFT",
  "BANK_CREDIT_ABSENT",
  "CHANNEL_UNTAGGED",
  "ORPHAN_REFUND",
  "DOUBLE_REFUND",
] as const;

export type ExceptionCode = (typeof EXCEPTION_CODES)[number];

/** Which claim a given fault is expected to break. */
export const FAULT_TARGET: Record<ExceptionCode, ClaimType> = {
  MANDATE_ATTESTATION_MISSING: "AUTHORIZED",
  MANDATE_ATTESTATION_INVALID: "AUTHORIZED",
  MANDATE_OVERSPEND: "AUTHORIZED",
  MANDATE_EXPIRED: "AUTHORIZED",
  CART_ATTESTATION_MISSING: "CART_BOUND",
  CART_ATTESTATION_INVALID: "CART_BOUND",
  CART_PAYMENT_MISMATCH: "CART_BOUND",
  RECEIPT_ABSENT: "RECEIPTED",
  RETRY_DOUBLE_BOOK: "IDEMPOTENT",
  SETTLEMENT_ABSENT: "SETTLED",
  SETTLEMENT_DRIFT: "SETTLED",
  BANK_CREDIT_ABSENT: "BANKED",
  CHANNEL_UNTAGGED: "BANKED",
  ORPHAN_REFUND: "REFUND_POLICY",
  DOUBLE_REFUND: "REFUND_POLICY",
};

export type Principal = {
  principal_id: string;
  name: string;
};

export type Merchant = {
  merchant_id: string;
  name: string;
};

export type Agent = {
  agent_id: string;
  principal_id: string;
};

export type IntentMandate = {
  intent_id: string;
  principal_id: string;
  agent_id: string;
  category: string;
  budget_paise: Paise;
  not_before: string;
  not_after: string;
  signature: string;
};

export type CartLine = {
  sku: string;
  qty: number;
  unit_paise: Paise;
};

export type CartMandate = {
  cart_id: string;
  intent_id: string;
  merchant_id: string;
  category: string;
  lines: CartLine[];
  total_paise: Paise;
  cart_hash: string;
  merchant_sig: string;
};

export type Payment = {
  payment_id: string;
  cart_id: string | null;
  rail: Rail;
  amount_paise: Paise;
  idempotency_key: string;
  paid_at: string;
};

export type Receipt = {
  receipt_id: string;
  payment_id: string;
  payload_hash: string;
  stored: boolean;
};

export type Order = {
  order_id: string;
  cart_id: string;
  payment_id: string;
};

export type Settlement = {
  settlement_id: string;
  payment_id: string;
  gross_paise: Paise;
  fee_paise: Paise;
  tax_paise: Paise;
  net_paise: Paise;
  psp_ref: string;
  settled_on: string;
};

export type BankLine = {
  bank_id: string;
  amount_paise: Paise;
  date: string;
  narration: string;
  intent_id: string | null;
};

export type Refund = {
  refund_id: string;
  payment_id: string;
  amount_paise: Paise;
  initiator: RefundInitiator;
  mandate_ref: string | null;
};

export type Sale = {
  sale_id: string;
  intent_id: string | null;
  cart_id: string | null;
  payment_id: string;
  order_id: string | null;
  settlement_id: string | null;
  fault: ExceptionCode | null;
};

export type World = {
  seed: number | null;
  week_start: string | null;
  keys: {
    principals: Record<string, string>;
    merchants: Record<string, string>;
  };
  principals: Principal[];
  merchants: Merchant[];
  agents: Agent[];
  intents: IntentMandate[];
  carts: CartMandate[];
  payments: Payment[];
  receipts: Receipt[];
  orders: Order[];
  settlements: Settlement[];
  bank: BankLine[];
  refunds: Refund[];
  sales: Sale[];
};

export type ClaimStatus = "OPEN" | "PROVEN" | "EXCEPTED" | "ABSTAINED";

export type Decision = {
  action: "prove" | "except";
  code?: ExceptionCode;
};

export type Evidence = {
  tool: string;
  args: Record<string, unknown>;
  result_hash: string;
  row_ids: string[];
};

export type Proposal = {
  claim_id: string;
  sale_id: string;
  type: ClaimType;
  action: "prove" | "except";
  code?: ExceptionCode;
  evidence: Evidence[];
};

export type Challenge = {
  claim_id: string;
  reason: string;
};

export type Claim = {
  claim_id: string;
  sale_id: string;
  type: ClaimType;
  status: ClaimStatus;
  code?: ExceptionCode;
  accepted_by?: "verifier";
  reject_reason?: string;
};

export type AnswerKeyEntry = {
  sale_id: string;
  type: ClaimType;
  expected_status: "PROVEN" | "EXCEPTED";
  expected_code?: ExceptionCode;
};

export type AnomalyKey = {
  // Sale ids grouped per planted structuring ring (limit-evasion pattern).
  structuring_rings: string[][];
};

export type Fixture = {
  world: World;
  answer_key: AnswerKeyEntry[];
  anomaly_key: AnomalyKey;
};

export function inr(paise: Paise): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import type { ExternalRecord } from "@/mandate/adapters";
import { canonicalize, sha256 } from "@/mandate/canonical";
import { decryptSecret, encryptSecret, randomId } from "./crypto";
import { getDb, nowMs } from "./db";
import { HttpError } from "./http";
import { ingestRecords, recordForUser, type IngestResult } from "./ledger";
import { createRazorpayOrder, razorpayPublic } from "./razorpay";

type SignerKind = "principal" | "merchant";
type Signer = { id: string; public_key_pem: string; private_key_pem: string };

export type VerifiedPurchaseInput = {
  principal_did: string;
  agent_did: string;
  merchant_id: string;
  category: string;
  sku: string;
  quantity: number;
  unit_paise: number;
  budget_paise: number;
  validity_minutes: number;
};

export type VerifiedPurchasePublic = {
  id: string;
  state: "creating" | "ready" | "paid" | "failed";
  mode: "test" | "live";
  order_id: string | null;
  payment_id: string | null;
  intent_hash: string;
  cart_hash: string;
  created_at: number;
  paid_at: number | null;
};

function text(value: unknown, field: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new HttpError(400, `${field} must be a non-empty string of at most ${max} characters.`, "invalid_purchase");
  }
  return value.trim();
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new HttpError(400, `${field} must be an integer between ${min} and ${max}.`, "invalid_purchase");
  }
  return Number(value);
}

export function parseVerifiedPurchaseInput(raw: unknown): VerifiedPurchaseInput {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "Purchase details are required.", "invalid_purchase");
  const body = raw as Record<string, unknown>;
  const quantity = integer(body.quantity, "Quantity", 1, 10_000);
  const unit = integer(body.unit_paise, "Unit amount", 100, 50_000_000);
  const total = quantity * unit;
  if (!Number.isSafeInteger(total) || total > 50_000_000) throw new HttpError(400, "Cart total is outside the supported range.", "invalid_purchase");
  return {
    principal_did: text(body.principal_did, "Principal DID"),
    agent_did: text(body.agent_did, "Agent DID"),
    merchant_id: text(body.merchant_id, "Merchant ID"),
    category: text(body.category, "Category", 80),
    sku: text(body.sku, "SKU", 128),
    quantity,
    unit_paise: unit,
    budget_paise: integer(body.budget_paise, "Mandate budget", total, 100_000_000),
    validity_minutes: integer(body.validity_minutes, "Validity", 5, 10_080),
  };
}

function signerFor(userId: string, kind: SignerKind): Signer {
  const db = getDb();
  const existing = db.prepare(
    "SELECT id, public_key_pem, private_key_cipher FROM evidence_signers WHERE user_id = ? AND kind = ?"
  ).get(userId, kind) as { id: string; public_key_pem: string; private_key_cipher: string } | undefined;
  if (existing) return { id: existing.id, public_key_pem: existing.public_key_pem, private_key_pem: decryptSecret(existing.private_key_cipher) };
  const pair = generateKeyPairSync("ed25519");
  const created: Signer = {
    id: randomId(kind === "principal" ? "prn" : "mrc"),
    public_key_pem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    private_key_pem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  db.prepare(
    "INSERT INTO evidence_signers (id, user_id, kind, public_key_pem, private_key_cipher, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(created.id, userId, kind, created.public_key_pem, encryptSecret(created.private_key_pem), nowMs());
  return created;
}

function signature(privateKeyPem: string, payload: unknown): string {
  return sign(null, Buffer.from(canonicalize(payload)), createPrivateKey(privateKeyPem)).toString("base64url");
}

export async function createVerifiedPurchase(userId: string, raw: unknown): Promise<{
  purchase: VerifiedPurchasePublic;
  order: { id: string; amount: number; currency: string; key_id: string };
}> {
  const input = parseVerifiedPurchaseInput(raw);
  const rzp = razorpayPublic(userId);
  if (!rzp.configured || !rzp.mode) throw new HttpError(400, "Connect Razorpay before creating a verified purchase.", "not_configured");
  const principal = signerFor(userId, "principal");
  const merchant = signerFor(userId, "merchant");
  const purchaseId = randomId("vps");
  const intentId = randomId("int");
  const cartId = randomId("crt");
  const created = nowMs();
  const validFrom = new Date(created - 30_000).toISOString();
  const validTo = new Date(created + input.validity_minutes * 60_000).toISOString();
  const intentPayload = {
    intent_id: intentId,
    principal_id: input.principal_did,
    agent_id: input.agent_did,
    category: input.category,
    budget_paise: input.budget_paise,
    not_before: validFrom,
    not_after: validTo,
  };
  const intent: NonNullable<ExternalRecord["ap2_intent"]> = {
    id: intentId,
    principal_did: input.principal_did,
    agent_did: input.agent_did,
    constraints: {
      budget_minor: input.budget_paise,
      category: input.category,
      valid_from: validFrom,
      valid_to: validTo,
    },
    signature: signature(principal.private_key_pem, intentPayload),
    public_key_pem: principal.public_key_pem,
  };
  const lines = [{ sku: input.sku, qty: input.quantity, unit_paise: input.unit_paise }];
  const total = input.quantity * input.unit_paise;
  const cartHash = sha256({
    intent_id: intentId,
    merchant_id: input.merchant_id,
    category: input.category,
    lines,
    total_paise: total,
  });
  const cart: NonNullable<ExternalRecord["ap2_cart"]> = {
    id: cartId,
    intent_id: intentId,
    merchant: input.merchant_id,
    items: [{ sku: input.sku, qty: input.quantity, unit_minor: input.unit_paise }],
    amount_minor: total,
    cart_hash: cartHash,
    merchant_signature: signature(merchant.private_key_pem, { cart_id: cartId, cart_hash: cartHash }),
    merchant_public_key_pem: merchant.public_key_pem,
  };
  const intentHash = sha256(intentPayload);
  const db = getDb();
  db.prepare(
    `INSERT INTO verified_purchases
      (id, user_id, state, mode, intent_json, cart_json, intent_hash, cart_hash, created_at)
     VALUES (?, ?, 'creating', ?, ?, ?, ?, ?, ?)`
  ).run(purchaseId, userId, rzp.mode, JSON.stringify(intent), JSON.stringify(cart), intentHash, cartHash, created);
  try {
    const order = await createRazorpayOrder(userId, total, {
      vera_purchase_id: purchaseId,
      vera_intent_hash: intentHash,
      vera_cart_hash: cartHash,
    });
    db.prepare("UPDATE verified_purchases SET state = 'ready', order_id = ? WHERE id = ? AND user_id = ?")
      .run(order.id, purchaseId, userId);
    return { purchase: getVerifiedPurchase(userId, purchaseId), order };
  } catch (error) {
    db.prepare("UPDATE verified_purchases SET state = 'failed', failure_reason = ? WHERE id = ? AND user_id = ?")
      .run((error instanceof Error ? error.message : "Order creation failed").slice(0, 500), purchaseId, userId);
    throw error;
  }
}

export function getVerifiedPurchase(userId: string, id: string): VerifiedPurchasePublic {
  const row = getDb().prepare(
    "SELECT id, state, mode, order_id, payment_id, intent_hash, cart_hash, created_at, paid_at FROM verified_purchases WHERE id = ? AND user_id = ?"
  ).get(id, userId) as VerifiedPurchasePublic | undefined;
  if (!row) throw new HttpError(404, "Verified purchase was not found.", "not_found");
  return row;
}

export function listVerifiedPurchases(userId: string, limit = 20): VerifiedPurchasePublic[] {
  return getDb().prepare(
    "SELECT id, state, mode, order_id, payment_id, intent_hash, cart_hash, created_at, paid_at FROM verified_purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(userId, Math.max(1, Math.min(100, limit))) as VerifiedPurchasePublic[];
}

export function attachVerifiedPurchaseEvidence(userId: string, orderId: string, paymentId: string): IngestResult | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT id, state, intent_json, cart_json, payment_id, paid_at FROM verified_purchases WHERE user_id = ? AND order_id = ?"
  ).get(userId, orderId) as { id: string; state: string; intent_json: string; cart_json: string; payment_id: string | null; paid_at: number | null } | undefined;
  if (!row) return null;
  if (row.state !== "ready" && row.state !== "paid") throw new HttpError(409, "Verified purchase is not ready for capture.", "invalid_purchase_state");
  if (row.payment_id && row.payment_id !== paymentId) throw new HttpError(409, "This purchase is already bound to another payment.", "payment_conflict");
  const record = recordForUser(userId, paymentId);
  if (!record) throw new HttpError(409, "Captured payment has not been ingested yet.", "payment_missing");
  const intent = JSON.parse(row.intent_json) as NonNullable<ExternalRecord["ap2_intent"]>;
  const cart = JSON.parse(row.cart_json) as NonNullable<ExternalRecord["ap2_cart"]>;
  const merchant = signerFor(userId, "merchant");
  const paidAt = row.paid_at ?? nowMs();
  const issuedAt = new Date(paidAt).toISOString();
  const receiptPayload = {
    receipt_id: `rcp_${sha256({ purchase_id: row.id, payment_id: paymentId }).slice(0, 32)}`,
    payment_id: paymentId,
    order_id: orderId,
    cart_hash: cart.cart_hash,
    amount_paise: record.payment.amount_minor,
    issued_at: issuedAt,
  };
  const receiptHash = sha256(receiptPayload);
  const receiptBytes = Buffer.from(canonicalize(receiptPayload));
  const enriched: ExternalRecord = {
    ...record,
    ap2_intent: intent,
    ap2_cart: cart,
    receipt: {
      id: receiptPayload.receipt_id,
      stored: true,
      payload_hash: receiptHash,
      issued_at: issuedAt,
      merchant_signature: signature(merchant.private_key_pem, { receipt_id: receiptPayload.receipt_id, payment_id: paymentId, payload_hash: receiptHash, issued_at: issuedAt }),
      merchant_public_key_pem: merchant.public_key_pem,
      source: "merchant_signed",
    },
    order: { id: orderId },
  };
  return db.transaction(() => {
    const result = ingestRecords(userId, "verified_purchase", [enriched]);
    const artifactExists = db.prepare(
      "SELECT 1 FROM evidence_artifacts WHERE user_id = ? AND payment_id = ? AND kind = 'receipt' AND payload_hash = ? LIMIT 1"
    ).get(userId, paymentId, receiptHash);
    if (!artifactExists) db.prepare(
      "INSERT INTO evidence_artifacts (id, user_id, payment_id, kind, file_name, mime_type, payload, payload_hash, created_at) VALUES (?, ?, ?, 'receipt', ?, 'application/json', ?, ?, ?)"
    ).run(randomId("art"), userId, paymentId, `${receiptPayload.receipt_id}.json`, receiptBytes, receiptHash, paidAt);
    db.prepare(
      "UPDATE verified_purchases SET state = 'paid', payment_id = ?, paid_at = ? WHERE id = ? AND user_id = ? AND state IN ('ready', 'paid')"
    ).run(paymentId, paidAt, row.id, userId);
    return result;
  })();
}

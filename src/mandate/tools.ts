import { hmacVerify, sha256 } from "./canonical";
import type {
  BankLine,
  CartMandate,
  IntentMandate,
  Payment,
  Receipt,
  Refund,
  Settlement,
  World,
} from "./types";

export type ToolName =
  | "get_intent"
  | "verify_intent_sig"
  | "get_cart"
  | "verify_cart_sig"
  | "cart_within_intent"
  | "get_payment"
  | "find_payment_by_idempotency"
  | "get_receipt"
  | "settlement_for_payment"
  | "bank_candidates"
  | "refunds_for_payment";

export type ToolFn = (world: World, args: Record<string, unknown>) => unknown;

function req(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`tool arg '${key}' must be a string`);
  }
  return value;
}

function reqNum(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`tool arg '${key}' must be a finite number`);
  }
  return value;
}

function findIntent(world: World, intent_id: string): IntentMandate | null {
  return world.intents.find((i) => i.intent_id === intent_id) ?? null;
}
function findCart(world: World, cart_id: string): CartMandate | null {
  return world.carts.find((c) => c.cart_id === cart_id) ?? null;
}
function findPayment(world: World, payment_id: string): Payment | null {
  return world.payments.find((p) => p.payment_id === payment_id) ?? null;
}

export const TOOLS: Record<ToolName, ToolFn> = {
  get_intent(world, args) {
    return findIntent(world, req(args, "intent_id"));
  },

  verify_intent_sig(world, args) {
    const intent = findIntent(world, req(args, "intent_id"));
    if (!intent) return { found: false, valid: false };
    const key = world.keys.principals[intent.principal_id];
    const { signature, ...payload } = intent;
    return { found: true, valid: key ? hmacVerify(key, payload, signature) : false };
  },

  get_cart(world, args) {
    return findCart(world, req(args, "cart_id"));
  },

  verify_cart_sig(world, args) {
    const cart = findCart(world, req(args, "cart_id"));
    if (!cart) return { found: false, valid: false, hash_match: false };
    const key = world.keys.merchants[cart.merchant_id];
    const recomputed = sha256({
      intent_id: cart.intent_id,
      merchant_id: cart.merchant_id,
      category: cart.category,
      lines: cart.lines,
      total_paise: cart.total_paise,
    });
    const sigOk = key
      ? hmacVerify(key, { cart_id: cart.cart_id, cart_hash: cart.cart_hash }, cart.merchant_sig)
      : false;
    return {
      found: true,
      valid: sigOk,
      hash_match: recomputed === cart.cart_hash,
      recomputed_hash: recomputed,
      stored_hash: cart.cart_hash,
    };
  },

  cart_within_intent(world, args) {
    const cart = findCart(world, req(args, "cart_id"));
    const intent = findIntent(world, req(args, "intent_id"));
    const payment = findPayment(world, req(args, "payment_id"));
    if (!cart || !intent || !payment) {
      return { found: false };
    }
    const withinBudget = cart.total_paise <= intent.budget_paise;
    const categoryMatch = cart.category === intent.category;
    const paidAt = Date.parse(payment.paid_at);
    const withinTime =
      paidAt >= Date.parse(intent.not_before) && paidAt <= Date.parse(intent.not_after);
    return {
      found: true,
      withinBudget,
      categoryMatch,
      withinTime,
      budget_paise: intent.budget_paise,
      total_paise: cart.total_paise,
    };
  },

  get_payment(world, args) {
    return findPayment(world, req(args, "payment_id"));
  },

  find_payment_by_idempotency(world, args) {
    const key = req(args, "idempotency_key");
    const matches = world.payments.filter((p) => p.idempotency_key === key);
    return { count: matches.length, payment_ids: matches.map((p) => p.payment_id) };
  },

  get_receipt(world, args) {
    const payment_id = req(args, "payment_id");
    const receipt: Receipt | null =
      world.receipts.find((r) => r.payment_id === payment_id) ?? null;
    return receipt;
  },

  settlement_for_payment(world, args) {
    const payment_id = req(args, "payment_id");
    const settlement: Settlement | null =
      world.settlements.find((s) => s.payment_id === payment_id) ?? null;
    return settlement;
  },

  bank_candidates(world, args) {
    const amount = reqNum(args, "amount_paise");
    const date = req(args, "date");
    const windowDays = reqNum(args, "window_days");
    const target = Date.parse(date);
    const window = windowDays * 86_400_000;
    const lines: BankLine[] = world.bank.filter(
      (line) =>
        line.amount_paise === amount &&
        Math.abs(Date.parse(line.date) - target) <= window
    );
    return lines;
  },

  refunds_for_payment(world, args) {
    const payment_id = req(args, "payment_id");
    const refunds: Refund[] = world.refunds.filter((r) => r.payment_id === payment_id);
    return refunds;
  },
};

export function callToolRaw(world: World, tool: ToolName, args: Record<string, unknown>): unknown {
  const fn = TOOLS[tool];
  if (!fn) throw new Error(`unknown tool: ${tool}`);
  return fn(world, args);
}

const ID_KEYS = new Set([
  "intent_id",
  "cart_id",
  "payment_id",
  "receipt_id",
  "order_id",
  "settlement_id",
  "bank_id",
  "refund_id",
]);

/** Every id-looking string present anywhere in a tool result. */
export function rowIdsOf(result: unknown): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, val] of Object.entries(value)) {
        if (ID_KEYS.has(key) && typeof val === "string") ids.add(val);
        else visit(val);
      }
    }
  };
  visit(result);
  return [...ids];
}

const ALL_ID_ARRAYS: (keyof World)[] = [
  "intents",
  "carts",
  "payments",
  "receipts",
  "orders",
  "settlements",
  "bank",
  "refunds",
];

/** True if an id exists on any object in the world (verifier row check). */
export function rowExists(world: World, id: string): boolean {
  for (const key of ALL_ID_ARRAYS) {
    const rows = world[key] as { [k: string]: unknown }[];
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (ID_KEYS.has(k) && v === id) return true;
      }
    }
  }
  return false;
}

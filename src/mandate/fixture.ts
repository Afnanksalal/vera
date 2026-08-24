import { hmacSign, sha256 } from "./canonical";
import { Rng } from "./rng";
import {
  EXCEPTION_CODES,
  FAULT_TARGET,
  CLAIM_TYPES,
  type AnswerKeyEntry,
  type CartLine,
  type CartMandate,
  type ExceptionCode,
  type Fixture,
  type IntentMandate,
  type Payment,
  type Rail,
  type World,
} from "./types";

export type FixtureConfig = {
  seed: number;
  weekStart: string;
  principals: number;
  merchants: number;
  cleanAgentSales: number;
  humanSales: number;
  categories: string[];
  amountRupees: { min: number; max: number };
  slackRupees: { min: number; max: number };
  deltaRupees: { min: number; max: number };
  plants: Record<ExceptionCode, number>;
  structuring: { rings: number; perRing: number; capFraction: number; spacingMinutes: number };
};

export const DEFAULT_CONFIG: FixtureConfig = {
  seed: 42,
  weekStart: "2026-08-10",
  principals: 3,
  merchants: 2,
  cleanAgentSales: 32,
  humanSales: 20,
  categories: ["groceries", "electronics", "apparel", "office", "travel"],
  amountRupees: { min: 800, max: 7000 },
  slackRupees: { min: 500, max: 3000 },
  deltaRupees: { min: 200, max: 2500 },
  plants: {
    MANDATE_ATTESTATION_MISSING: 0,
    MANDATE_ATTESTATION_INVALID: 0,
    MANDATE_OVERSPEND: 4,
    MANDATE_EXPIRED: 3,
    CART_ATTESTATION_MISSING: 0,
    CART_ATTESTATION_INVALID: 0,
    CART_PAYMENT_MISMATCH: 4,
    RECEIPT_ABSENT: 5,
    RECEIPT_ATTESTATION_INVALID: 0,
    RETRY_DOUBLE_BOOK: 3,
    SETTLEMENT_ABSENT: 0,
    SETTLEMENT_DRIFT: 3,
    BANK_CREDIT_ABSENT: 0,
    CHANNEL_UNTAGGED: 2,
    ORPHAN_REFUND: 2,
    DOUBLE_REFUND: 2,
  },
  structuring: { rings: 1, perRing: 4, capFraction: 0.93, spacingMinutes: 12 },
};

function dayISO(weekStart: string, offsetDays: number): string {
  const base = Date.parse(`${weekStart}T00:00:00.000Z`);
  return new Date(base + offsetDays * 86_400_000 + 12 * 3_600_000).toISOString();
}

function pad(n: number, width = 3): string {
  return String(n).padStart(width, "0");
}

type HumanPayment = { amount: Paise; date: string };
type Paise = number;

function buildFaultOrder(config: FixtureConfig, rng: Rng): (ExceptionCode | null)[] {
  const planted: (ExceptionCode | null)[] = [];
  for (const code of EXCEPTION_CODES) {
    const count = config.plants[code] ?? 0;
    for (let i = 0; i < count; i++) planted.push(code);
  }
  const clean: (ExceptionCode | null)[] = Array.from(
    { length: config.cleanAgentSales },
    () => null
  );
  return rng.shuffle([...planted, ...clean]);
}

export function buildFixture(overrides: Partial<FixtureConfig> = {}): Fixture {
  const config: FixtureConfig = { ...DEFAULT_CONFIG, ...overrides };
  const rng = new Rng(config.seed);

  const world: World = {
    seed: config.seed,
    week_start: config.weekStart,
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

  for (let i = 0; i < config.principals; i++) {
    const principal_id = `prn_${pad(i)}`;
    world.principals.push({ principal_id, name: `Principal ${i}` });
    world.keys.principals[principal_id] = rng.hex(16);
    world.agents.push({ agent_id: `agt_${pad(i)}`, principal_id });
  }
  for (let i = 0; i < config.merchants; i++) {
    const merchant_id = `mch_${pad(i)}`;
    world.merchants.push({ merchant_id, name: `Merchant ${i}` });
    world.keys.merchants[merchant_id] = rng.hex(16);
  }

  const humanPool: HumanPayment[] = [];
  for (let i = 0; i < config.humanSales; i++) {
    const amount = rng.int(config.amountRupees.min, config.amountRupees.max) * 100;
    const date = dayISO(config.weekStart, rng.int(0, 4) + 2);
    humanPool.push({ amount, date });
    world.bank.push({
      bank_id: `bnk_hum_${pad(i)}`,
      amount_paise: amount,
      date,
      narration: "NEFT CR HUMAN CARD SETTLEMENT",
      intent_id: null,
    });
  }
  let humanCursor = 0;

  const answerKey: AnswerKeyEntry[] = [];
  const faultOrder = buildFaultOrder(config, rng);

  faultOrder.forEach((fault, index) => {
    const principal = world.principals[index % world.principals.length];
    const agent = world.agents[index % world.agents.length];
    const merchant = world.merchants[index % world.merchants.length];
    const category = rng.pick(config.categories);

    const baseTotal = rng.int(config.amountRupees.min, config.amountRupees.max) * 100;
    const slack = rng.int(config.slackRupees.min, config.slackRupees.max) * 100;
    const delta = rng.int(config.deltaRupees.min, config.deltaRupees.max) * 100;

    // Cart total and budget.
    let total = baseTotal;
    const budget = total + slack;
    if (fault === "MANDATE_OVERSPEND") {
      const overshoot = rng.int(config.deltaRupees.min, config.deltaRupees.max) * 100;
      total = budget + overshoot; // total strictly above budget
    }

    const lineCount = rng.int(1, 3);
    const lines: CartLine[] = [];
    let remaining = total;
    for (let l = 0; l < lineCount; l++) {
      const last = l === lineCount - 1;
      const unit = last ? remaining : Math.max(100, Math.floor(remaining / (lineCount - l + 1)));
      remaining -= unit;
      lines.push({ sku: `SKU-${category.slice(0, 3).toUpperCase()}-${index}-${l}`, qty: 1, unit_paise: unit });
    }

    const sale_id = `sale_${pad(index)}`;
    const intent_id = `int_${pad(index)}`;
    const cart_id = `crt_${pad(index)}`;
    const payment_id = `pay_${pad(index)}`;
    const order_id = `ord_${pad(index)}`;
    const settlement_id = `set_${pad(index)}`;

    // Timing. Spread payments across each business day so normal same-agent
    // activity does not accidentally look like a burst.
    const notBefore = dayISO(config.weekStart, 0);
    const notAfter = dayISO(config.weekStart, 6);
    const dayBase = Date.parse(`${config.weekStart}T00:00:00.000Z`) + rng.int(0, 4) * 86_400_000;
    let paidAt = new Date(dayBase + rng.int(6 * 60, 20 * 60) * 60_000).toISOString();
    if (fault === "MANDATE_EXPIRED") {
      paidAt = dayISO(config.weekStart, 8); // strictly after not_after
    }

    const intentPayload = {
      intent_id,
      principal_id: principal.principal_id,
      agent_id: agent.agent_id,
      category,
      budget_paise: budget,
      not_before: notBefore,
      not_after: notAfter,
    };
    const intent: IntentMandate = {
      ...intentPayload,
      signature: hmacSign(world.keys.principals[principal.principal_id], intentPayload),
    };
    world.intents.push(intent);

    const cartHashPayload = { intent_id, merchant_id: merchant.merchant_id, category, lines, total_paise: total };
    const cart_hash = sha256(cartHashPayload);
    const cart: CartMandate = {
      cart_id,
      intent_id,
      merchant_id: merchant.merchant_id,
      category,
      lines,
      total_paise: total,
      cart_hash,
      merchant_sig: hmacSign(world.keys.merchants[merchant.merchant_id], { cart_id, cart_hash }),
    };
    world.carts.push(cart);

    // Payment amount (mismatch fault drifts it from the cart total).
    let amount = total;
    if (fault === "CART_PAYMENT_MISMATCH") {
      amount = total + delta;
    }

    const rail: Rail = fault === "RECEIPT_ABSENT" ? "x402" : rng.pick(["acp", "ap2_card", "x402"] as Rail[]);
    const idKey = `idem_${pad(index)}`;
    const payment: Payment = {
      payment_id,
      cart_id,
      rail,
      amount_paise: amount,
      idempotency_key: idKey,
      paid_at: paidAt,
    };
    world.payments.push(payment);

    if (fault === "RETRY_DOUBLE_BOOK") {
      world.payments.push({
        payment_id: `pay_${pad(index)}_dup`,
        cart_id,
        rail,
        amount_paise: amount,
        idempotency_key: idKey, // same key = double post
        paid_at: dayISO(config.weekStart, rng.int(0, 5)),
      });
    }

    // Receipt.
    const receiptStored = fault !== "RECEIPT_ABSENT";
    world.receipts.push({
      receipt_id: `rcp_${pad(index)}`,
      payment_id,
      payload_hash: receiptStored ? sha256({ payment_id, amount }) : "",
      stored: receiptStored,
    });

    world.orders.push({ order_id, cart_id, payment_id });

    // Settlement (drift fault breaks net == amount).
    let net = amount;
    if (fault === "SETTLEMENT_DRIFT") {
      net = amount + delta;
    }
    const settledOn = dayISO(config.weekStart, 6);
    world.settlements.push({
      settlement_id,
      payment_id,
      gross_paise: amount,
      fee_paise: 0,
      tax_paise: 0,
      net_paise: net,
      psp_ref: `psp_${pad(index)}`,
      settled_on: settledOn,
    });

    // Bank line. CHANNEL_UNTAGGED bundles the agent payment with human volume
    // into one untagged lump so it cannot be joined back to the intent.
    if (fault === "CHANNEL_UNTAGGED") {
      const h1 = humanPool[humanCursor % humanPool.length];
      const h2 = humanPool[(humanCursor + 1) % humanPool.length];
      humanCursor += 2;
      world.bank.push({
        bank_id: `bnk_lump_${pad(index)}`,
        amount_paise: amount + h1.amount + h2.amount,
        date: settledOn,
        narration: "NEFT CR MIXED CARD SETTLEMENT",
        intent_id: null,
      });
    } else {
      world.bank.push({
        bank_id: `bnk_${pad(index)}`,
        amount_paise: amount,
        date: settledOn,
        narration: "NEFT CR AGENT SETTLEMENT",
        intent_id,
      });
    }

    // Refunds.
    if (fault === "ORPHAN_REFUND") {
      world.refunds.push({
        refund_id: `ref_${pad(index)}_0`,
        payment_id,
        amount_paise: Math.floor(amount / 2),
        initiator: "agent_cs",
        mandate_ref: null,
      });
    } else if (fault === "DOUBLE_REFUND") {
      world.refunds.push({
        refund_id: `ref_${pad(index)}_cs`,
        payment_id,
        amount_paise: Math.floor(amount / 2),
        initiator: "agent_cs",
        mandate_ref: `${intent_id}#refund`,
      });
      world.refunds.push({
        refund_id: `ref_${pad(index)}_cb`,
        payment_id,
        amount_paise: amount,
        initiator: "chargeback",
        mandate_ref: `${intent_id}#dispute`,
      });
    }

    world.sales.push({ sale_id, intent_id, cart_id, payment_id, order_id, settlement_id, fault });

    // Answer key: default every claim PROVEN, flip the targeted one.
    for (const type of CLAIM_TYPES) {
      if (fault && FAULT_TARGET[fault] === type) {
        answerKey.push({ sale_id, type, expected_status: "EXCEPTED", expected_code: fault });
      } else {
        answerKey.push({ sale_id, type, expected_status: "PROVEN" });
      }
    }
  });

  // Structuring rings: one agent splits spend into several carts each just under
  // its mandate cap, within a short window. Every such sale passes all seven
  // typed claims; the limit-evasion pattern is only visible across sales. This
  // is the open-world anomaly the taxonomy does not encode.
  const structuringRings: string[][] = [];
  let ringIndex = faultOrder.length;
  for (let r = 0; r < config.structuring.rings; r++) {
    const principal = world.principals[r % world.principals.length];
    const agent = world.agents[r % world.agents.length];
    const merchant = world.merchants[r % world.merchants.length];
    const category = config.categories[r % config.categories.length];
    const budget = rng.int(config.amountRupees.max, config.amountRupees.max + 2000) * 100;
    const ringSales: string[] = [];
    const baseTs = Date.parse(dayISO(config.weekStart, 2));

    for (let m = 0; m < config.structuring.perRing; m++) {
      const index = ringIndex++;
      const sale_id = `sale_${pad(index)}`;
      const intent_id = `int_${pad(index)}`;
      const cart_id = `crt_${pad(index)}`;
      const payment_id = `pay_${pad(index)}`;
      const order_id = `ord_${pad(index)}`;
      const settlement_id = `set_${pad(index)}`;
      const total = Math.floor(budget * config.structuring.capFraction);
      const paidAt = new Date(baseTs + m * config.structuring.spacingMinutes * 60_000).toISOString();
      const notBefore = dayISO(config.weekStart, 0);
      const notAfter = dayISO(config.weekStart, 6);

      const intentPayload = {
        intent_id,
        principal_id: principal.principal_id,
        agent_id: agent.agent_id,
        category,
        budget_paise: budget,
        not_before: notBefore,
        not_after: notAfter,
      };
      world.intents.push({
        ...intentPayload,
        signature: hmacSign(world.keys.principals[principal.principal_id], intentPayload),
      });

      const lines: CartLine[] = [{ sku: `SKU-${category.slice(0, 3).toUpperCase()}-R${r}-${m}`, qty: 1, unit_paise: total }];
      const cartHashPayload = { intent_id, merchant_id: merchant.merchant_id, category, lines, total_paise: total };
      const cart_hash = sha256(cartHashPayload);
      world.carts.push({
        cart_id,
        intent_id,
        merchant_id: merchant.merchant_id,
        category,
        lines,
        total_paise: total,
        cart_hash,
        merchant_sig: hmacSign(world.keys.merchants[merchant.merchant_id], { cart_id, cart_hash }),
      });

      world.payments.push({
        payment_id,
        cart_id,
        rail: "ap2_card",
        amount_paise: total,
        idempotency_key: `idem_${pad(index)}`,
        paid_at: paidAt,
      });
      world.receipts.push({ receipt_id: `rcp_${pad(index)}`, payment_id, payload_hash: sha256({ payment_id, total }), stored: true });
      world.orders.push({ order_id, cart_id, payment_id });
      const settledOn = dayISO(config.weekStart, 6);
      world.settlements.push({ settlement_id, payment_id, gross_paise: total, fee_paise: 0, tax_paise: 0, net_paise: total, psp_ref: `psp_${pad(index)}`, settled_on: settledOn });
      world.bank.push({ bank_id: `bnk_${pad(index)}`, amount_paise: total, date: settledOn, narration: "NEFT CR AGENT SETTLEMENT", intent_id });

      world.sales.push({ sale_id, intent_id, cart_id, payment_id, order_id, settlement_id, fault: null });
      for (const type of CLAIM_TYPES) answerKey.push({ sale_id, type, expected_status: "PROVEN" });
      ringSales.push(sale_id);
    }
    structuringRings.push(ringSales);
  }

  return { world, answer_key: answerKey, anomaly_key: { structuring_rings: structuringRings } };
}

export function totalAgentSales(config: FixtureConfig = DEFAULT_CONFIG): number {
  const planted = Object.values(config.plants).reduce((a, b) => a + b, 0);
  const ring = config.structuring.rings * config.structuring.perRing;
  return planted + config.cleanAgentSales + ring;
}

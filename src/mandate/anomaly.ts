import type { ChatMessage, ChatModel, ChatToolSpec } from "./llm";
import type { World } from "./types";

/**
 * Open-world anomaly synthesis. Typed claims catch the faults we can name. Some
 * risks are patterns across many clean sales that no single-claim rule expresses
 * (for example limit evasion: one agent splitting spend into several carts each
 * just under its mandate cap within a short window). Here a proposer (a model,
 * or a deterministic search) invents a rule in a small safe DSL; the rule is
 * executed and validated for coverage and coherence; accepted anomalies are
 * routed to human review and never auto-actioned.
 */

export type NumField = "cart_total" | "budget" | "ratio" | "amount" | "paid_ms";
export type StrField = "agent_id" | "principal_id" | "category";
export type Cmp = ">=" | ">" | "<=" | "<" | "==" | "!=";

export type Condition = { field: NumField | StrField; op: Cmp; value: number | string };

export type AnomalyRule = {
  id: string;
  name: string;
  description: string;
  where: Condition[]; // AND-ed per-sale filters
  group_by: "agent_id" | "principal_id" | "none";
  window_minutes: number; // 0 = ignore timing
  min_count: number; // fire when a group/window holds at least this many
};

export type SaleFeature = {
  sale_id: string;
  agent_id: string;
  principal_id: string;
  category: string;
  cart_total: number;
  budget: number;
  ratio: number;
  amount: number;
  paid_ms: number;
};

const NUM_FIELDS: NumField[] = ["cart_total", "budget", "ratio", "amount", "paid_ms"];

export function extractFeatures(world: World): SaleFeature[] {
  const intentById = new Map(world.intents.map((i) => [i.intent_id, i]));
  const cartById = new Map(world.carts.map((c) => [c.cart_id, c]));
  const payById = new Map(world.payments.map((p) => [p.payment_id, p]));
  const features: SaleFeature[] = [];
  for (const sale of world.sales) {
    const intent = intentById.get(sale.intent_id);
    const cart = cartById.get(sale.cart_id);
    const pay = payById.get(sale.payment_id);
    if (!intent || !cart || !pay) continue;
    features.push({
      sale_id: sale.sale_id,
      agent_id: intent.agent_id,
      principal_id: intent.principal_id,
      category: intent.category,
      cart_total: cart.total_paise,
      budget: intent.budget_paise,
      ratio: intent.budget_paise ? cart.total_paise / intent.budget_paise : 0,
      amount: pay.amount_paise,
      paid_ms: Date.parse(pay.paid_at),
    });
  }
  return features;
}

function fieldValue(f: SaleFeature, field: NumField | StrField): number | string {
  return f[field];
}

function compare(a: number | string, op: Cmp, b: number | string): boolean {
  if (op === "==") return a === b;
  if (op === "!=") return a !== b;
  if (typeof a !== "number" || typeof b !== "number") return false;
  switch (op) {
    case ">=":
      return a >= b;
    case ">":
      return a > b;
    case "<=":
      return a <= b;
    case "<":
      return a < b;
  }
}

function passesWhere(f: SaleFeature, where: Condition[]): boolean {
  return where.every((c) => compare(fieldValue(f, c.field), c.op, c.value));
}

/** Deterministically evaluate a rule and return the flagged sale ids. */
export function evaluateRule(features: SaleFeature[], rule: AnomalyRule): string[] {
  const filtered = features.filter((f) => passesWhere(f, rule.where));
  const flagged = new Set<string>();

  const groups = new Map<string, SaleFeature[]>();
  for (const f of filtered) {
    const gkey = rule.group_by === "none" ? "*" : String(f[rule.group_by]);
    const list = groups.get(gkey) ?? [];
    list.push(f);
    groups.set(gkey, list);
  }

  for (const list of groups.values()) {
    if (rule.window_minutes <= 0) {
      if (list.length >= rule.min_count) list.forEach((f) => flagged.add(f.sale_id));
      continue;
    }
    const windowMs = rule.window_minutes * 60_000;
    const sorted = [...list].sort((a, b) => a.paid_ms - b.paid_ms);
    for (let i = 0; i < sorted.length; i++) {
      const windowItems = sorted.filter((f) => f.paid_ms >= sorted[i].paid_ms && f.paid_ms <= sorted[i].paid_ms + windowMs);
      if (windowItems.length >= rule.min_count) windowItems.forEach((f) => flagged.add(f.sale_id));
    }
  }

  return [...flagged].sort();
}

export type Validation = {
  accepted: boolean;
  reason: string;
  fires: string[];
  coverage: number;
  coherent: boolean;
};

/**
 * A rule is accepted only if it fires on a small, coherent slice: at least
 * `minAbs` sales, at most `maxFraction` of the batch, min_count >= 2, and (when
 * grouped) every fired sale shares the grouping key of some qualifying group.
 * This is the coverage/precision gate that stops "fires on everything" rules.
 */
export function validateRule(
  features: SaleFeature[],
  rule: AnomalyRule,
  opts: { minAbs?: number; maxFraction?: number } = {}
): Validation {
  const minAbs = opts.minAbs ?? 2;
  const maxFraction = opts.maxFraction ?? 0.25;
  const fires = evaluateRule(features, rule);
  const coverage = features.length ? fires.length / features.length : 0;

  let coherent = true;
  if (rule.group_by !== "none" && fires.length > 0) {
    const byGroup = new Map<string, number>();
    const featById = new Map(features.map((f) => [f.sale_id, f]));
    for (const id of fires) {
      const f = featById.get(id)!;
      const k = String(f[rule.group_by]);
      byGroup.set(k, (byGroup.get(k) ?? 0) + 1);
    }
    coherent = [...byGroup.values()].every((n) => n >= rule.min_count);
  }

  let accepted = true;
  let reason = "fires on a small, coherent slice";
  if (rule.min_count < 2) {
    accepted = false;
    reason = "min_count below 2 is not a pattern";
  } else if (fires.length < minAbs) {
    accepted = false;
    reason = "fires on too few sales";
  } else if (coverage > maxFraction) {
    accepted = false;
    reason = `fires on ${(coverage * 100).toFixed(0)}% of sales (too broad)`;
  } else if (!coherent) {
    accepted = false;
    reason = "flagged sales are not concentrated in qualifying groups";
  }

  return { accepted, reason, fires, coverage, coherent };
}

export type Discovery = { rule: AnomalyRule; validation: Validation; status: "human_review" };

/**
 * Deterministic discoverer: search a small grid of rules over the DSL and return
 * the most specific accepted anomalies (smallest coverage first). No hardcoded
 * answer: the grid is generic, and the structuring ring is found because it is
 * the only pattern that satisfies a rule.
 */
export function discoverDeterministic(features: SaleFeature[]): Discovery[] {
  const ratios = [0.85, 0.9, 0.93];
  const minCounts = [3, 4];
  const windows = [60, 240];
  const found: Discovery[] = [];
  const seen = new Set<string>();

  for (const ratio of ratios) {
    for (const min_count of minCounts) {
      for (const window_minutes of windows) {
        const rule: AnomalyRule = {
          id: `struct-r${ratio}-c${min_count}-w${window_minutes}`,
          name: "Possible mandate-cap structuring",
          description: `One agent placing ${min_count}+ carts at >= ${(ratio * 100).toFixed(0)}% of the mandate cap within ${window_minutes} minutes`,
          where: [{ field: "ratio", op: ">=", value: ratio }],
          group_by: "agent_id",
          window_minutes,
          min_count,
        };
        const validation = validateRule(features, rule);
        if (!validation.accepted) continue;
        const key = validation.fires.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ rule, validation, status: "human_review" });
      }
    }
  }

  return found.sort((a, b) => a.validation.coverage - b.validation.coverage);
}

const PROPOSE_ANOMALY_TOOL: ChatToolSpec = {
  name: "propose_anomaly",
  description:
    "Propose one anomaly rule that flags a suspicious cross-sale pattern the typed claims miss. Keep it specific: it should fire on a small, coherent slice.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      where: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string", enum: ["cart_total", "budget", "ratio", "amount", "paid_ms", "agent_id", "principal_id", "category"] },
            op: { type: "string", enum: [">=", ">", "<=", "<", "==", "!="] },
            value: {},
          },
          required: ["field", "op", "value"],
        },
      },
      group_by: { type: "string", enum: ["agent_id", "principal_id", "none"] },
      window_minutes: { type: "number" },
      min_count: { type: "number" },
    },
    required: ["name", "where", "group_by", "window_minutes", "min_count"],
  },
};

function sanitizeRule(raw: Record<string, unknown>): AnomalyRule | null {
  const whereRaw = Array.isArray(raw.where) ? raw.where : [];
  const where: Condition[] = [];
  for (const c of whereRaw) {
    const cond = c as Record<string, unknown>;
    const field = cond.field as Condition["field"];
    const op = cond.op as Cmp;
    const value = cond.value as number | string;
    const okField = NUM_FIELDS.includes(field as NumField) || ["agent_id", "principal_id", "category"].includes(field as string);
    const okOp = [">=", ">", "<=", "<", "==", "!="].includes(op);
    if (okField && okOp && (typeof value === "number" || typeof value === "string")) {
      where.push({ field, op, value });
    }
  }
  if (where.length === 0) return null;
  const group_by = (["agent_id", "principal_id", "none"].includes(raw.group_by as string) ? raw.group_by : "none") as AnomalyRule["group_by"];
  const window_minutes = typeof raw.window_minutes === "number" ? raw.window_minutes : 0;
  const min_count = typeof raw.min_count === "number" ? Math.floor(raw.min_count) : 0;
  return {
    id: "model-proposed",
    name: typeof raw.name === "string" ? raw.name : "Proposed anomaly",
    description: typeof raw.description === "string" ? raw.description : "",
    where,
    group_by,
    window_minutes,
    min_count,
  };
}

export type ModelProposal = { rule: AnomalyRule | null; validation: Validation | null; status: "human_review" | "rejected" };

/** Ask a model to invent an anomaly rule; execute and validate it deterministically. */
export async function proposeAnomalyWithModel(model: ChatModel, features: SaleFeature[]): Promise<ModelProposal> {
  const summary = summarize(features);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You look for cross-sale fraud/ops patterns that per-sale checks miss, such as an agent splitting spend into several carts just under its mandate cap within a short window (structuring). Propose exactly one specific rule with propose_anomaly. Ratio is cart_total/budget. paid_ms is a unix millisecond timestamp.",
    },
    { role: "user", content: `Batch summary:\n${JSON.stringify(summary)}` },
  ];

  let rule: AnomalyRule | null = null;
  try {
    const completion = await model.complete(messages, [PROPOSE_ANOMALY_TOOL]);
    const call = completion.tool_calls.find((t) => t.name === "propose_anomaly");
    if (call) rule = sanitizeRule(call.args);
  } catch {
    rule = null;
  }
  if (!rule) return { rule: null, validation: null, status: "rejected" };

  const validation = validateRule(features, rule);
  return { rule, validation, status: validation.accepted ? "human_review" : "rejected" };
}

function summarize(features: SaleFeature[]) {
  const byAgent = new Map<string, number>();
  for (const f of features) byAgent.set(f.agent_id, (byAgent.get(f.agent_id) ?? 0) + 1);
  return {
    count: features.length,
    agents: [...byAgent.entries()].map(([agent_id, n]) => ({ agent_id, sales: n })),
    sample: features.slice(0, 40).map((f) => ({
      sale_id: f.sale_id,
      agent_id: f.agent_id,
      category: f.category,
      ratio: Number(f.ratio.toFixed(3)),
      paid_ms: f.paid_ms,
    })),
  };
}

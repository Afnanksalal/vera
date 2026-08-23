import { BANK_WINDOW_DAYS } from "./decide";
import { Rng } from "./rng";
import type { ToolName } from "./tools";
import type { ClaimType, Sale, World } from "./types";

export type Plan = { tool: ToolName; args: Record<string, unknown> };

/**
 * A planner decides which tools an agent calls to gather evidence for a claim.
 * This is the seam where a model could drive tool selection: swap the planner,
 * never the verifier. The verifier accepts a proposal on evidence integrity and
 * an independent audit, so it is agnostic to how the plan was produced.
 */
export interface Planner {
  readonly name: string;
  planFor(world: World, sale: Sale, type: ClaimType): Plan[];
}

function basePlan(world: World, sale: Sale, type: ClaimType): Plan[] {
  const payment = world.payments.find((p) => p.payment_id === sale.payment_id);
  const settlement = world.settlements.find((s) => s.payment_id === sale.payment_id);
  switch (type) {
    case "AUTHORIZED":
      return [
        { tool: "get_intent", args: { intent_id: sale.intent_id } },
        { tool: "verify_intent_sig", args: { intent_id: sale.intent_id } },
        {
          tool: "cart_within_intent",
          args: { cart_id: sale.cart_id, intent_id: sale.intent_id, payment_id: sale.payment_id },
        },
      ];
    case "CART_BOUND":
      return [
        { tool: "get_cart", args: { cart_id: sale.cart_id } },
        { tool: "verify_cart_sig", args: { cart_id: sale.cart_id } },
        { tool: "get_payment", args: { payment_id: sale.payment_id } },
      ];
    case "RECEIPTED":
      return [{ tool: "get_receipt", args: { payment_id: sale.payment_id } }];
    case "IDEMPOTENT":
      return [
        { tool: "get_payment", args: { payment_id: sale.payment_id } },
        {
          tool: "find_payment_by_idempotency",
          args: { idempotency_key: payment?.idempotency_key ?? "" },
        },
      ];
    case "SETTLED":
      return [
        { tool: "get_payment", args: { payment_id: sale.payment_id } },
        { tool: "settlement_for_payment", args: { payment_id: sale.payment_id } },
      ];
    case "BANKED":
      return [
        { tool: "get_payment", args: { payment_id: sale.payment_id } },
        { tool: "settlement_for_payment", args: { payment_id: sale.payment_id } },
        {
          tool: "bank_candidates",
          args: {
            amount_paise: payment?.amount_paise ?? -1,
            date: settlement?.settled_on ?? world.week_start,
            window_days: BANK_WINDOW_DAYS,
          },
        },
      ];
    case "REFUND_POLICY":
      return [
        { tool: "get_payment", args: { payment_id: sale.payment_id } },
        { tool: "refunds_for_payment", args: { payment_id: sale.payment_id } },
      ];
    default:
      return [];
  }
}

/** Deterministic policy planner: fixed tool sequence per claim type. */
export class PolicyPlanner implements Planner {
  readonly name = "policy";
  planFor(world: World, sale: Sale, type: ClaimType): Plan[] {
    return basePlan(world, sale, type);
  }
}

/**
 * Same evidence set, deterministically reordered by seed. Used to prove the
 * verifier's verdict does not depend on plan order, the property a model-driven
 * planner would need to satisfy to be safe.
 */
export class ReorderingPlanner implements Planner {
  readonly name = "reordering";
  private readonly rng: Rng;
  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }
  planFor(world: World, sale: Sale, type: ClaimType): Plan[] {
    return this.rng.shuffle(basePlan(world, sale, type));
  }
}

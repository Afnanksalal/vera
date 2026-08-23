import { Rng } from "../rng";
import type { MatchItem, MatchProblem } from "./solver";

export type MatchFixtureConfig = {
  seed: number;
  weekStart: string;
  groups: number; // clean lumped credits (each a sum of 2-3 units)
  singles: number; // 1:1 credits
  bigGroups: number; // credits summing more units than the solver's subset cap
  bigGroupSize: number;
  decoys: number; // credits engineered to have an alternative feasible grouping
  inTransitUnits: number; // settled units with no bank credit yet
  unexplainedCredits: number; // bank credits with no matching units
  tolerancePaise: number;
  windowDays: number;
};

export const DEFAULT_MATCH_CONFIG: MatchFixtureConfig = {
  seed: 42,
  weekStart: "2026-08-10",
  groups: 6,
  singles: 8,
  bigGroups: 1,
  bigGroupSize: 5,
  decoys: 2,
  inTransitUnits: 3,
  unexplainedCredits: 2,
  tolerancePaise: 100,
  windowDays: 2,
};

export type MatchAnswerKey = {
  true_groups: { credit_id: string; unit_ids: string[] }[];
  in_transit_unit_ids: string[];
  unexplained_credit_ids: string[];
  ambiguous_credit_ids: string[];
  beyond_solver_credit_ids: string[];
};

export type MatchFixture = { problem: MatchProblem; key: MatchAnswerKey };

function day(weekStart: string, offset: number): string {
  const base = Date.parse(`${weekStart}T00:00:00.000Z`);
  return new Date(base + offset * 86_400_000 + 12 * 3_600_000).toISOString();
}

/**
 * A settlement-to-bank matching problem with real structure: lumped credits
 * (N:1), a few 1:1s, decoys that admit a second feasible grouping (ambiguity),
 * units still in transit, and credits with no explanation. The answer key holds
 * the true groups so reconciliation can be scored.
 */
export function buildMatchFixture(overrides: Partial<MatchFixtureConfig> = {}): MatchFixture {
  const config = { ...DEFAULT_MATCH_CONFIG, ...overrides };
  const rng = new Rng(config.seed ^ 0x9e37);

  const units: MatchItem[] = [];
  const credits: MatchItem[] = [];
  const key: MatchAnswerKey = {
    true_groups: [],
    in_transit_unit_ids: [],
    unexplained_credit_ids: [],
    ambiguous_credit_ids: [],
    beyond_solver_credit_ids: [],
  };

  let u = 0;
  let c = 0;
  const newUnit = (amount: number, offset: number): MatchItem => {
    const item: MatchItem = { id: `set_${String(u).padStart(3, "0")}`, amount_paise: amount, date: day(config.weekStart, offset), label: `settlement ${u}` };
    u += 1;
    units.push(item);
    return item;
  };
  const newCredit = (amount: number, offset: number): MatchItem => {
    const item: MatchItem = { id: `bnk_${String(c).padStart(3, "0")}`, amount_paise: amount, date: day(config.weekStart, offset), label: `NEFT credit ${c}` };
    c += 1;
    credits.push(item);
    return item;
  };

  // Clean lumped groups: 2-3 units sum to one credit.
  for (let g = 0; g < config.groups; g++) {
    const offset = rng.int(0, 4);
    const size = rng.int(2, 3);
    const groupUnits: MatchItem[] = [];
    for (let k = 0; k < size; k++) groupUnits.push(newUnit(rng.int(500, 6000) * 100, offset));
    const total = groupUnits.reduce((s, x) => s + x.amount_paise, 0);
    const credit = newCredit(total, offset);
    key.true_groups.push({ credit_id: credit.id, unit_ids: groupUnits.map((x) => x.id) });
  }

  // Big groups: a credit that sums more units than the solver's subset cap, so
  // the deterministic search cannot find it at all. The units share a reference
  // token with the credit, so a model can group them; the verifier (no cap)
  // confirms the exact sum. This is a match only the AI-guided path recovers.
  for (let bg = 0; bg < config.bigGroups; bg++) {
    const offset = rng.int(0, 3);
    const ref = `BIG-${bg}`;
    const members: MatchItem[] = [];
    for (let k = 0; k < config.bigGroupSize; k++) {
      const unit = newUnit(rng.int(500, 4000) * 100, offset);
      unit.tokens = [ref];
      members.push(unit);
    }
    const total = members.reduce((s, x) => s + x.amount_paise, 0);
    const credit = newCredit(total, offset);
    credit.tokens = [ref];
    key.true_groups.push({ credit_id: credit.id, unit_ids: members.map((x) => x.id) });
    key.beyond_solver_credit_ids.push(credit.id);
  }

  // Simple 1:1 matches.
  for (let s = 0; s < config.singles; s++) {
    const offset = rng.int(0, 4);
    const unit = newUnit(rng.int(500, 8000) * 100, offset);
    const credit = newCredit(unit.amount_paise, offset);
    key.true_groups.push({ credit_id: credit.id, unit_ids: [unit.id] });
  }

  // Decoys: a true pair, plus a third unit that alone also matches the credit
  // within tolerance. By amount alone there are two feasible groupings, so the
  // credit is ambiguous. The true pair shares a counterparty token with the
  // credit; the decoy single carries a different one. A rules engine that only
  // sums amounts must abstain; a model that reads the token can break the tie.
  for (let d = 0; d < config.decoys; d++) {
    const offset = rng.int(0, 3);
    const ref = `ACME-${d}`;
    const other = `ZETA-${d}`;
    const a = newUnit(rng.int(1000, 3000) * 100, offset);
    const b = newUnit(rng.int(1000, 3000) * 100, offset);
    const total = a.amount_paise + b.amount_paise;
    const credit = newCredit(total, offset);
    const decoySingle = newUnit(total, offset);
    a.tokens = [ref];
    b.tokens = [ref];
    credit.tokens = [ref];
    decoySingle.tokens = [other];
    key.true_groups.push({ credit_id: credit.id, unit_ids: [a.id, b.id] });
    key.ambiguous_credit_ids.push(credit.id);
  }

  // Units settled but not yet credited (in transit) -> exceptions on the unit side.
  for (let t = 0; t < config.inTransitUnits; t++) {
    const unit = newUnit(rng.int(500, 5000) * 100, rng.int(0, 4));
    key.in_transit_unit_ids.push(unit.id);
  }

  // Bank credits with no matching units -> exceptions on the credit side.
  for (let x = 0; x < config.unexplainedCredits; x++) {
    const credit = newCredit(rng.int(500, 9000) * 100 + 37, rng.int(0, 4)); // odd amount, unlikely to be a sum
    key.unexplained_credit_ids.push(credit.id);
  }

  const problem: MatchProblem = {
    credits: rng.shuffle(credits),
    units: rng.shuffle(units),
    tolerance_paise: config.tolerancePaise,
    window_days: config.windowDays,
  };
  return { problem, key };
}

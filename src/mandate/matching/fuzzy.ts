import type { Labelled } from "../conformal";
import type { MatchAnswerKey } from "./fixture";
import { searchGroupings, verifyAssignment, type Assignment, type MatchProblem } from "./solver";

export type FuzzyMatch = {
  credit_id: string;
  unit_ids: string[];
  ambiguity: number; // number of alternative feasible groupings (0 = unique)
  score: number; // nonconformity: lower = more confident
};

export type FuzzyResult = {
  matches: FuzzyMatch[];
  unexplained_credit_ids: string[];
  verify: ReturnType<typeof verifyAssignment>;
};

/**
 * A deliberately fallible matcher: for every credit it commits the *best-effort*
 * grouping (fewest units, then smallest |delta|) even when several groupings are
 * feasible. It therefore makes mistakes on ambiguous credits. Its nonconformity
 * score is the ambiguity count, which the conformal layer calibrates against to
 * accept only low-risk matches with a guaranteed error rate.
 */
export function fuzzyReconcile(problem: MatchProblem): FuzzyResult {
  const used = new Set<string>();
  const resolved: { credit_id: string; unit_ids: string[]; ambiguity: number }[] = [];
  const unexplained: string[] = [];

  // Most-constrained-first improves greedy quality without removing ambiguity.
  const order = [...problem.credits].sort((a, b) => {
    const fa = searchGroupings(problem, a).length;
    const fb = searchGroupings(problem, b).length;
    return fa - fb;
  });

  for (const credit of order) {
    const scoped: MatchProblem = { ...problem, units: problem.units.filter((u) => !used.has(u.id)) };
    const feas = searchGroupings(scoped, credit);
    if (feas.length === 0) {
      unexplained.push(credit.id);
      continue;
    }
    const pick = [...feas].sort((x, y) => {
      if (x.length !== y.length) return x.length - y.length;
      const sx = sumOf(problem, x) - credit.amount_paise;
      const sy = sumOf(problem, y) - credit.amount_paise;
      return Math.abs(sx) - Math.abs(sy);
    })[0];
    pick.forEach((id) => used.add(id));
    resolved.push({ credit_id: credit.id, unit_ids: pick, ambiguity: feas.length - 1 });
  }

  const assignment: Assignment = resolved.map((r) => ({ credit_id: r.credit_id, unit_ids: r.unit_ids }));
  const verify = verifyAssignment(problem, assignment);
  const matches: FuzzyMatch[] = resolved.map((r) => ({
    credit_id: r.credit_id,
    unit_ids: r.unit_ids,
    ambiguity: r.ambiguity,
    score: r.ambiguity, // nonconformity
  }));
  return { matches, unexplained_credit_ids: unexplained, verify };
}

function sumOf(problem: MatchProblem, unitIds: string[]): number {
  const byId = new Map(problem.units.map((u) => [u.id, u]));
  return unitIds.reduce((s, id) => s + (byId.get(id)?.amount_paise ?? 0), 0);
}

/**
 * Independent per-credit best guess with an ambiguity score. Unlike the greedy
 * global assignment, this does not consume units, so the ambiguity count is a
 * faithful nonconformity signal for conformal calibration: 0 = a single feasible
 * grouping (very likely correct), higher = more competing groupings.
 */
export function scoreCredits(problem: MatchProblem): FuzzyMatch[] {
  const out: FuzzyMatch[] = [];
  for (const credit of problem.credits) {
    const feas = searchGroupings(problem, credit);
    if (feas.length === 0) continue; // unexplained, not a match decision
    const pick = [...feas].sort((x, y) => {
      if (x.length !== y.length) return x.length - y.length;
      const sx = Math.abs(sumOf(problem, x) - credit.amount_paise);
      const sy = Math.abs(sumOf(problem, y) - credit.amount_paise);
      return sx - sy;
    })[0];
    out.push({ credit_id: credit.id, unit_ids: pick, ambiguity: feas.length - 1, score: feas.length - 1 });
  }
  return out;
}

/** Turn per-credit guesses into conformal (score, correct) labels using the key. */
export function labelScored(matches: FuzzyMatch[], key: MatchAnswerKey): Labelled[] {
  const truth = new Map(key.true_groups.map((g) => [g.credit_id, [...g.unit_ids].sort().join(",")]));
  return matches.map((m) => ({
    score: m.score,
    correct: truth.get(m.credit_id) === [...m.unit_ids].sort().join(","),
  }));
}

export type MatchItem = {
  id: string;
  amount_paise: number;
  date: string;
  label: string;
  tokens?: string[];
};

export type MatchProblem = {
  credits: MatchItem[];
  units: MatchItem[];
  tolerance_paise: number;
  window_days: number;
};

/** One credit explained by a set of unit ids (a group). */
export type Group = { credit_id: string; unit_ids: string[] };
export type Assignment = Group[];

const DAY = 86_400_000;

function within(aDate: string, bDate: string, windowDays: number): boolean {
  return Math.abs(Date.parse(aDate) - Date.parse(bDate)) <= windowDays * DAY;
}

/**
 * Enumerate every set of units (inside the date window) whose amounts sum to a
 * credit within tolerance. The search has an explicit work budget. Callers
 * must treat a truncated search as ambiguous; it is never evidence that a
 * match is unique or absent.
 */
export function searchGroupingsDetailed(
  problem: MatchProblem,
  credit: MatchItem,
  opts: { maxResults?: number; maxNodes?: number } = {}
): { groups: string[][]; truncated: boolean; explored_nodes: number } {
  const maxResults = opts.maxResults ?? 9;
  const maxNodes = opts.maxNodes ?? 250_000;
  const pool = problem.units
    .filter((u) => within(u.date, credit.date, problem.window_days))
    .filter((u) => u.amount_paise <= credit.amount_paise + problem.tolerance_paise)
    .sort((a, b) => b.amount_paise - a.amount_paise);

  const results: string[][] = [];
  const chosen: MatchItem[] = [];
  let explored = 0;
  let truncated = false;

  const recurse = (start: number, sum: number): void => {
    explored += 1;
    if (explored > maxNodes || results.length >= maxResults) {
      truncated = true;
      return;
    }
    if (Math.abs(sum - credit.amount_paise) <= problem.tolerance_paise && chosen.length > 0) {
      results.push(chosen.map((c) => c.id));
      // keep searching for alternative groupings (ambiguity), do not return
    }
    for (let i = start; i < pool.length; i++) {
      const next = sum + pool[i].amount_paise;
      if (next > credit.amount_paise + problem.tolerance_paise) continue; // prune (sorted desc)
      chosen.push(pool[i]);
      recurse(i + 1, next);
      chosen.pop();
      if (truncated) return;
    }
  };

  recurse(0, 0);
  return { groups: results, truncated, explored_nodes: explored };
}

/** Compatibility helper for tests and diagnostics that only need candidates. */
export function searchGroupings(problem: MatchProblem, credit: MatchItem): string[][] {
  return searchGroupingsDetailed(problem, credit).groups;
}

export type VerifyResult = {
  ok: boolean;
  reasons: string[];
  matched_value_paise: number;
  proof: { credit_id: string; sum_paise: number; delta_paise: number; unit_ids: string[] }[];
  reused_units: string[];
  unmatched_credit_ids: string[];
  unmatched_unit_ids: string[];
};

/**
 * Independently verify a proposed assignment: every group sums to its credit
 * within tolerance and inside the window, no unit is used twice, and all ids
 * exist. Deterministic and O(n); the trust boundary for LLM-proposed matches.
 */
export function verifyAssignment(problem: MatchProblem, assignment: Assignment): VerifyResult {
  const creditById = new Map(problem.credits.map((c) => [c.id, c]));
  const unitById = new Map(problem.units.map((u) => [u.id, u]));
  const reasons: string[] = [];
  const proof: VerifyResult["proof"] = [];
  const used = new Map<string, number>();
  let matched = 0;
  const matchedCredits = new Set<string>();

  for (const group of assignment) {
    const credit = creditById.get(group.credit_id);
    if (!credit) {
      reasons.push(`unknown credit ${group.credit_id}`);
      continue;
    }
    if (group.unit_ids.length === 0) {
      reasons.push(`empty group for ${group.credit_id}`);
      continue;
    }
    let sum = 0;
    let bad = false;
    for (const uid of group.unit_ids) {
      const unit = unitById.get(uid);
      if (!unit) {
        reasons.push(`unknown unit ${uid}`);
        bad = true;
        continue;
      }
      used.set(uid, (used.get(uid) ?? 0) + 1);
      if (!within(unit.date, credit.date, problem.window_days)) {
        reasons.push(`unit ${uid} outside window of ${credit.id}`);
        bad = true;
      }
      sum += unit.amount_paise;
    }
    const delta = sum - credit.amount_paise;
    if (Math.abs(delta) > problem.tolerance_paise) {
      reasons.push(`group for ${credit.id} sums ${sum}, off by ${delta}`);
      bad = true;
    }
    proof.push({ credit_id: credit.id, sum_paise: sum, delta_paise: delta, unit_ids: group.unit_ids });
    if (!bad) {
      matched += credit.amount_paise;
      matchedCredits.add(credit.id);
    }
  }

  const reused = [...used.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (reused.length) reasons.push(`units reused: ${reused.join(", ")}`);

  const claimedUnits = new Set(assignment.flatMap((g) => g.unit_ids));
  const unmatchedUnits = problem.units.filter((u) => !claimedUnits.has(u.id)).map((u) => u.id);
  const unmatchedCredits = problem.credits.filter((c) => !matchedCredits.has(c.id)).map((c) => c.id);

  return {
    ok: reasons.length === 0,
    reasons,
    matched_value_paise: matched,
    proof,
    reused_units: reused,
    unmatched_credit_ids: unmatchedCredits,
    unmatched_unit_ids: unmatchedUnits,
  };
}

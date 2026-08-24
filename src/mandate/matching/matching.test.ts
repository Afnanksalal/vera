import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatCompletion, ChatModel } from "../llm";
import { buildMatchFixture } from "./fixture";
import { reconcileDeterministic, reconcileWithModel } from "./reconcile";
import { searchGroupings, verifyAssignment, type MatchProblem } from "./solver";

const D = "2026-08-12T12:00:00.000Z";

function hand(): MatchProblem {
  return {
    credits: [{ id: "c1", amount_paise: 300, date: D, label: "c1" }],
    units: [
      { id: "u1", amount_paise: 100, date: D, label: "u1" },
      { id: "u2", amount_paise: 200, date: D, label: "u2" },
      { id: "u3", amount_paise: 300, date: D, label: "u3" },
    ],
    tolerance_paise: 0,
    window_days: 2,
  };
}

test("searchGroupings finds every subset that sums to the credit", () => {
  const groups = searchGroupings(hand(), hand().credits[0]);
  const asSets = groups.map((g) => g.slice().sort().join(","));
  assert.ok(asSets.includes("u3"));
  assert.ok(asSets.includes("u1,u2"));
  assert.equal(groups.length, 2, "two feasible groupings = ambiguous");
});

test("verifyAssignment accepts an exact group and reports a proof", () => {
  const p = hand();
  const v = verifyAssignment(p, [{ credit_id: "c1", unit_ids: ["u1", "u2"] }]);
  assert.equal(v.ok, true);
  assert.equal(v.proof[0].sum_paise, 300);
  assert.equal(v.proof[0].delta_paise, 0);
});

test("verifyAssignment rejects a wrong sum, a reuse, and an out-of-window unit", () => {
  const p = hand();
  assert.equal(verifyAssignment(p, [{ credit_id: "c1", unit_ids: ["u1"] }]).ok, false);

  const reuse: MatchProblem = {
    ...p,
    credits: [
      { id: "c1", amount_paise: 100, date: D, label: "c1" },
      { id: "c2", amount_paise: 100, date: D, label: "c2" },
    ],
    units: [{ id: "u1", amount_paise: 100, date: D, label: "u1" }],
  };
  const v = verifyAssignment(reuse, [
    { credit_id: "c1", unit_ids: ["u1"] },
    { credit_id: "c2", unit_ids: ["u1"] },
  ]);
  assert.equal(v.ok, false);
  assert.ok(v.reused_units.includes("u1"));

  const far: MatchProblem = {
    ...p,
    units: [{ id: "u1", amount_paise: 300, date: "2026-09-01T12:00:00.000Z", label: "u1" }],
  };
  assert.equal(verifyAssignment(far, [{ credit_id: "c1", unit_ids: ["u1"] }]).ok, false);
});

test("deterministic reconcile is always internally consistent and abstains on ambiguity", () => {
  const { problem, key } = buildMatchFixture();
  const r = reconcileDeterministic(problem);
  assert.equal(r.verify.ok, true, "committed matches must verify");
  for (const id of key.unexplained_credit_ids) {
    assert.ok(r.unexplained_credit_ids.includes(id), `unexplained ${id}`);
  }
  // Decoys have two feasible groupings, so the deterministic pass must not
  // silently pick one: they land in ambiguous or unexplained, never matched.
  const matchedIds = new Set(r.matches.map((m) => m.credit_id));
  for (const id of key.ambiguous_credit_ids) {
    assert.ok(!matchedIds.has(id), `decoy ${id} should be abstained, not matched`);
  }
});

class ScriptedMatcher implements ChatModel {
  readonly name = "scripted";
  constructor(private readonly matches: { credit_id: string; unit_ids: string[] }[]) {}
  async complete(): Promise<ChatCompletion> {
    return { content: null, tool_calls: [{ id: "m", name: "propose_matches", args: { matches: this.matches } }] };
  }
}

test("the deterministic solver supports groups larger than four units", () => {
  const credit = { id: "c-five", amount_paise: 150, date: D, label: "five" };
  const problem: MatchProblem = {
    credits: [credit],
    units: [10, 20, 30, 40, 50].map((amount, index) => ({ id: `u${index}`, amount_paise: amount, date: D, label: `u${index}` })),
    tolerance_paise: 0,
    window_days: 2,
  };
  assert.deepEqual(searchGroupings(problem, credit), [["u4", "u3", "u2", "u1", "u0"]]);
});

test("model-guided reconcile recovers matches the deterministic pass could not", async () => {
  const { problem, key } = buildMatchFixture();
  const deterministic = reconcileDeterministic(problem);
  const model = new ScriptedMatcher(key.true_groups);
  const guided = await reconcileWithModel(model, problem);

  assert.equal(guided.verify.ok, true, "only verified matches are committed");
  assert.ok(
    guided.coverage.matched > deterministic.coverage.matched,
    "the model must disambiguate at least one additional verified match"
  );
  const guidedIds = new Set(guided.matches.map((m) => m.credit_id));
  for (const id of key.beyond_solver_credit_ids) {
    assert.ok(guidedIds.has(id), `model should recover big group ${id}`);
  }
  for (const id of key.ambiguous_credit_ids) {
    assert.ok(guidedIds.has(id), `model should disambiguate decoy ${id}`);
  }
});

test("a lying model proposal is rejected by the verifier, never committed", async () => {
  const { problem, key } = buildMatchFixture();
  const good = key.true_groups[0];
  // Corrupt the first group by adding an unrelated unit so the sum is wrong.
  const strayUnit = problem.units.find((u) => !good.unit_ids.includes(u.id))!;
  const lie = [{ credit_id: good.credit_id, unit_ids: [...good.unit_ids, strayUnit.id] }];
  const guided = await reconcileWithModel(new ScriptedMatcher(lie), problem);

  assert.equal(guided.verify.ok, true);
  const committed = guided.matches.find((m) => m.credit_id === good.credit_id);
  if (committed) {
    // If resolved at all, it must be via the deterministic fallback, not the lie.
    assert.notDeepEqual(committed.unit_ids.slice().sort(), lie[0].unit_ids.slice().sort());
  }
});

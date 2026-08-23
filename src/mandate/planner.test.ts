import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFixture } from "./fixture";
import { runClose } from "./orchestrate";
import { PolicyPlanner, ReorderingPlanner } from "./planner";

function statuses(seed: number, planner?: PolicyPlanner | ReorderingPlanner) {
  const { world } = buildFixture({ seed });
  return runClose(world, planner)
    .claims.map((c) => `${c.claim_id}:${c.status}:${c.code ?? ""}`)
    .sort();
}

test("verdicts do not depend on planner or tool order", () => {
  const policy = statuses(42, new PolicyPlanner());
  const reordered = statuses(42, new ReorderingPlanner(9));
  assert.deepEqual(policy, reordered);
});

test("a different reorder seed still yields identical verdicts", () => {
  const a = statuses(42, new ReorderingPlanner(1));
  const b = statuses(42, new ReorderingPlanner(999));
  assert.deepEqual(a, b);
});

test("default planner is the policy planner", () => {
  const { world } = buildFixture({ seed: 3 });
  assert.equal(runClose(world).planner, "policy");
});

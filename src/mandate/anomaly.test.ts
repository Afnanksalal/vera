import assert from "node:assert/strict";
import { test } from "node:test";
import {
  discoverDeterministic,
  evaluateRule,
  extractFeatures,
  proposeAnomalyWithModel,
  validateRule,
  type AnomalyRule,
} from "./anomaly";
import { buildFixture } from "./fixture";
import type { ChatCompletion, ChatModel } from "./llm";

const RING_RULE: AnomalyRule = {
  id: "hand",
  name: "structuring",
  description: "agent splits spend under the cap",
  where: [{ field: "ratio", op: ">=", value: 0.9 }],
  group_by: "agent_id",
  window_minutes: 60,
  min_count: 4,
};

test("features expose ratio near the cap for ring sales", () => {
  const { world, anomaly_key } = buildFixture();
  const features = extractFeatures(world);
  const ring = new Set(anomaly_key.structuring_rings.flat());
  const ringFeatures = features.filter((f) => ring.has(f.sale_id));
  assert.ok(ringFeatures.length > 0);
  assert.ok(ringFeatures.every((f) => f.ratio >= 0.9), "ring carts sit just under the cap");
});

test("a windowed group rule flags exactly the structuring ring", () => {
  const { world, anomaly_key } = buildFixture();
  const features = extractFeatures(world);
  const fired = new Set(evaluateRule(features, RING_RULE));
  const ring = anomaly_key.structuring_rings.flat();
  for (const id of ring) assert.ok(fired.has(id), `ring sale ${id} should fire`);
});

test("validation rejects an everything-rule and accepts the specific one", () => {
  const { world } = buildFixture();
  const features = extractFeatures(world);
  const everything: AnomalyRule = {
    id: "loose",
    name: "loose",
    description: "",
    where: [{ field: "ratio", op: ">=", value: 0 }],
    group_by: "none",
    window_minutes: 0,
    min_count: 2,
  };
  assert.equal(validateRule(features, everything).accepted, false);
  assert.equal(validateRule(features, RING_RULE).accepted, true);
});

test("deterministic discovery finds the ring and routes it to human review", () => {
  const { world, anomaly_key } = buildFixture();
  const features = extractFeatures(world);
  const found = discoverDeterministic(features);
  assert.ok(found.length > 0, "at least one anomaly discovered");
  const ring = new Set(anomaly_key.structuring_rings.flat());
  const hit = found.find((d) => {
    const fires = new Set(d.validation.fires);
    return [...ring].every((id) => fires.has(id));
  });
  assert.ok(hit, "a discovered rule covers the whole ring");
  assert.equal(hit!.status, "human_review");
});

class ScriptedProposer implements ChatModel {
  readonly name = "scripted";
  constructor(private readonly rule: unknown) {}
  async complete(): Promise<ChatCompletion> {
    return { content: null, tool_calls: [{ id: "a", name: "propose_anomaly", args: this.rule as Record<string, unknown> }] };
  }
}

test("a model-proposed specific rule is validated and sent to human review", async () => {
  const { world, anomaly_key } = buildFixture();
  const features = extractFeatures(world);
  const proposal = await proposeAnomalyWithModel(new ScriptedProposer(RING_RULE), features);
  assert.equal(proposal.status, "human_review");
  assert.ok(proposal.validation?.accepted);
  const fires = new Set(proposal.validation!.fires);
  for (const id of anomaly_key.structuring_rings.flat()) assert.ok(fires.has(id));
});

test("a model-proposed everything-rule is rejected", async () => {
  const { world } = buildFixture();
  const features = extractFeatures(world);
  const bad = { name: "bad", where: [{ field: "ratio", op: ">=", value: 0 }], group_by: "none", window_minutes: 0, min_count: 1 };
  const proposal = await proposeAnomalyWithModel(new ScriptedProposer(bad), features);
  assert.equal(proposal.status, "rejected");
});

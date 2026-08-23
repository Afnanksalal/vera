import assert from "node:assert/strict";
import { test } from "node:test";
import { decideClaim } from "./decide";
import { buildFixture } from "./fixture";
import type { ChatCompletion, ChatMessage, ChatModel } from "./llm";
import { runCloseLLM } from "./orchestrate";
import type { Claim, Sale, World } from "./types";

function parseContext(messages: ChatMessage[]): Record<string, string> {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && typeof m.content === "string" && m.content.includes("Context")) {
      const brace = m.content.indexOf("{");
      if (brace >= 0) {
        try {
          return JSON.parse(m.content.slice(brace, m.content.indexOf("}") + 1));
        } catch {
          /* ignore */
        }
      }
    }
  }
  return {};
}

/** A deterministic stand-in for a real model, so the loop is testable offline. */
class ScriptedModel implements ChatModel {
  readonly name = "scripted";
  constructor(
    private readonly world: World,
    private readonly mode: "correct" | "lying" | "silent"
  ) {}

  async complete(messages: ChatMessage[]): Promise<ChatCompletion> {
    const ctx = parseContext(messages);
    const turns = messages.filter((m) => m.role === "assistant").length;

    if (this.mode === "silent") {
      return { content: null, tool_calls: [{ id: `t${turns}`, name: "get_intent", args: { intent_id: ctx.intent_id } }] };
    }
    if (turns === 0) {
      return { content: null, tool_calls: [{ id: "t0", name: "get_payment", args: { payment_id: ctx.payment_id } }] };
    }
    if (this.mode === "lying") {
      return { content: null, tool_calls: [{ id: "v", name: "submit_verdict", args: { action: "prove", rationale: "looks fine" } }] };
    }
    const sale = this.world.sales.find((s) => s.sale_id === ctx.sale_id) as Sale;
    const d = decideClaim(this.world, sale, ctx.claim_type);
    return {
      content: null,
      tool_calls: [{ id: "v", name: "submit_verdict", args: { action: d.action, code: d.code, rationale: "checked" } }],
    };
  }
}

function statusOf(claims: Claim[], saleId: string, type: string) {
  return claims.find((c) => c.claim_id === `${saleId}:${type}`);
}

test("model with correct verdicts closes a clean sale (all proven)", async () => {
  const { world } = buildFixture();
  const clean = world.sales.find((s) => s.fault === null)!;
  const run = await runCloseLLM(world, new ScriptedModel(world, "correct"), [clean]);
  assert.equal(run.claims.length, 7);
  assert.ok(run.claims.every((c) => c.status === "PROVEN"), "every claim proven");
});

test("model correctly excepts a planted fault with the right code", async () => {
  const { world } = buildFixture();
  const ra = world.sales.find((s) => s.fault === "RECEIPT_ABSENT")!;
  const run = await runCloseLLM(world, new ScriptedModel(world, "correct"), [ra]);
  const receipted = statusOf(run.claims, ra.sale_id, "RECEIPTED")!;
  assert.equal(receipted.status, "EXCEPTED");
  assert.equal(receipted.code, "RECEIPT_ABSENT");
});

test("a lying model (prove on a real fault) is overridden by the verifier", async () => {
  const { world } = buildFixture();
  const ra = world.sales.find((s) => s.fault === "RECEIPT_ABSENT")!;
  const run = await runCloseLLM(world, new ScriptedModel(world, "lying"), [ra]);
  const receipted = statusOf(run.claims, ra.sale_id, "RECEIPTED")!;
  assert.notEqual(receipted.status, "PROVEN", "the fault must not be proven");
  assert.equal(receipted.status, "ABSTAINED");
});

test("a silent model abstains on every claim", async () => {
  const { world } = buildFixture();
  const sale = world.sales[0];
  const run = await runCloseLLM(world, new ScriptedModel(world, "silent"), [sale]);
  assert.equal(run.proposals.length, 0);
  assert.ok(run.claims.every((c) => c.status === "ABSTAINED"));
});

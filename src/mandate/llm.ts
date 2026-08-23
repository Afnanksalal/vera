import { EXCEPTION_CODES } from "./types";

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

export type ChatToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatCompletion = { content: string | null; tool_calls: ToolCall[] };

/** A minimal chat model with tool calling. Implemented live and by test doubles. */
export interface ChatModel {
  readonly name: string;
  complete(messages: ChatMessage[], tools: ChatToolSpec[]): Promise<ChatCompletion>;
}

function strArg(name: string, description: string) {
  return { type: "object", properties: { [name]: { type: "string", description } }, required: [name] };
}

/** Tool schemas the investigator model may call. Mirrors src/mandate/tools.ts. */
export const TOOL_SPECS: ChatToolSpec[] = [
  { name: "get_intent", description: "Fetch the AP2 intent mandate.", parameters: strArg("intent_id", "the intent id") },
  { name: "verify_intent_sig", description: "Verify the intent mandate signature.", parameters: strArg("intent_id", "the intent id") },
  { name: "get_cart", description: "Fetch the signed cart.", parameters: strArg("cart_id", "the cart id") },
  { name: "verify_cart_sig", description: "Verify the merchant cart signature and recompute the cart hash.", parameters: strArg("cart_id", "the cart id") },
  {
    name: "cart_within_intent",
    description: "Check budget, category, and time window of a cart against its intent for a payment.",
    parameters: {
      type: "object",
      properties: {
        cart_id: { type: "string" },
        intent_id: { type: "string" },
        payment_id: { type: "string" },
      },
      required: ["cart_id", "intent_id", "payment_id"],
    },
  },
  { name: "get_payment", description: "Fetch the payment.", parameters: strArg("payment_id", "the payment id") },
  {
    name: "find_payment_by_idempotency",
    description: "Find all payments sharing an idempotency key (more than one means a double post).",
    parameters: strArg("idempotency_key", "the idempotency key"),
  },
  { name: "get_receipt", description: "Fetch the receipt for a payment; empty when absent.", parameters: strArg("payment_id", "the payment id") },
  { name: "settlement_for_payment", description: "Fetch the settlement covering a payment.", parameters: strArg("payment_id", "the payment id") },
  {
    name: "bank_candidates",
    description: "Find bank credits matching an amount and date within a day window.",
    parameters: {
      type: "object",
      properties: {
        amount_paise: { type: "number" },
        date: { type: "string" },
        window_days: { type: "number" },
      },
      required: ["amount_paise", "date", "window_days"],
    },
  },
  { name: "refunds_for_payment", description: "List refunds against a payment.", parameters: strArg("payment_id", "the payment id") },
  {
    name: "submit_verdict",
    description:
      "Submit the final verdict for this claim. action is 'prove' or 'except'. When 'except', code must be one of the known exception codes.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["prove", "except"] },
        code: { type: "string", enum: [...EXCEPTION_CODES] },
        rationale: { type: "string" },
      },
      required: ["action"],
    },
  },
];

/** Live OpenAI-compatible model. Enabled only when OPENAI_API_KEY is present. */
export class OpenAiModel implements ChatModel {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = (opts?.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.name = opts?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    if (!this.apiKey) throw new Error("OpenAiModel requires OPENAI_API_KEY");
  }

  async complete(messages: ChatMessage[], tools: ChatToolSpec[]): Promise<ChatCompletion> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.name,
        temperature: 0,
        messages,
        tools: tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        tool_choice: "auto",
      }),
    });
    if (!res.ok) {
      throw new Error(`model HTTP ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
    };
    const message = json.choices[0]?.message ?? { content: null };
    const tool_calls: ToolCall[] = (message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: safeParse(tc.function.arguments),
    }));
    return { content: message.content ?? null, tool_calls };
  }
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

/** Live Anthropic (Claude) model. Enabled when ANTHROPIC_API_KEY is present. */
export class AnthropicModel implements ChatModel {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.baseUrl = (opts?.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
    this.name = opts?.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
    if (!this.apiKey) throw new Error("AnthropicModel requires ANTHROPIC_API_KEY");
  }

  async complete(messages: ChatMessage[], tools: ChatToolSpec[]): Promise<ChatCompletion> {
    const system = messages
      .filter((m): m is { role: "system"; content: string } => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const converted: { role: "user" | "assistant"; content: AnthropicBlock[] }[] = [];
    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.role === "tool") {
        const block: AnthropicBlock = { type: "tool_result", tool_use_id: m.tool_call_id, content: m.content };
        const last = converted[converted.length - 1];
        if (last && last.role === "user") last.content.push(block);
        else converted.push({ role: "user", content: [block] });
        continue;
      }
      if (m.role === "user") {
        converted.push({ role: "user", content: [{ type: "text", text: m.content }] });
        continue;
      }
      // assistant
      const blocks: AnthropicBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      if ("tool_calls" in m && m.tool_calls) {
        for (const tc of m.tool_calls) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
      }
      converted.push({ role: "assistant", content: blocks });
    }

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.name,
        max_tokens: 4096,
        system,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        messages: converted,
      }),
    });
    if (!res.ok) throw new Error(`anthropic HTTP ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { content: AnthropicBlock[] };
    let content: string | null = null;
    const tool_calls: ToolCall[] = [];
    for (const block of json.content ?? []) {
      if (block.type === "text") content = (content ?? "") + block.text;
      else if (block.type === "tool_use") tool_calls.push({ id: block.id, name: block.name, args: block.input ?? {} });
    }
    return { content, tool_calls };
  }
}

export function getModelFromEnv(): ChatModel | null {
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicModel();
  if (process.env.OPENAI_API_KEY) return new OpenAiModel();
  return null;
}

export function modelStatus(): { enabled: boolean; provider: string | null; name: string | null } {
  if (process.env.ANTHROPIC_API_KEY) {
    return { enabled: true, provider: "anthropic", name: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5" };
  }
  if (process.env.OPENAI_API_KEY) {
    return { enabled: true, provider: "openai", name: process.env.OPENAI_MODEL ?? "gpt-4o-mini" };
  }
  return { enabled: false, provider: null, name: null };
}

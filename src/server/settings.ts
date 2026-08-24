import { AnthropicModel, OpenAiModel, type ChatModel } from "@/mandate/llm";
import { decryptSecret, encryptSecret } from "./crypto";
import { getDb, nowMs } from "./db";
import { HttpError } from "./http";
import { ABSOLUTE_MAX_EVENTS_PER_USER, DEFAULT_MAX_EVENTS_PER_USER } from "./config";

export type AiProvider = "anthropic" | "openai";

export type SystemSettings = {
  public_url: string;
  allow_live_razorpay: boolean;
  max_ingest_events: number;
};

export function getSystemSettings(): SystemSettings {
  const rows = getDb().prepare("SELECT key, value FROM system_settings").all() as { key: string; value: string }[];
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    public_url: values.get("public_url") ?? "",
    allow_live_razorpay: values.get("allow_live_razorpay") === "true",
    max_ingest_events: Number(values.get("max_ingest_events") ?? DEFAULT_MAX_EVENTS_PER_USER),
  };
}

export function saveSystemSettings(input: SystemSettings): SystemSettings {
  const publicUrl = input.public_url.trim().replace(/\/$/, "");
  if (publicUrl) {
    let parsed: URL;
    try {
      parsed = new URL(publicUrl);
    } catch {
      throw new HttpError(400, "Public URL must be an absolute URL.", "invalid_public_url");
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new HttpError(400, "Public URL must use HTTPS outside localhost.", "invalid_public_url");
    }
  }
  if (!Number.isSafeInteger(input.max_ingest_events) || input.max_ingest_events < 1_000 || input.max_ingest_events > ABSOLUTE_MAX_EVENTS_PER_USER) {
    throw new HttpError(400, `Ingest capacity must be between 1,000 and ${ABSOLUTE_MAX_EVENTS_PER_USER.toLocaleString("en-US")}.`, "invalid_ingest_capacity");
  }
  const db = getDb();
  const write = db.prepare(
    "INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  );
  const tx = db.transaction(() => {
    write.run("public_url", publicUrl, nowMs());
    write.run("allow_live_razorpay", String(Boolean(input.allow_live_razorpay)), nowMs());
    write.run("max_ingest_events", String(input.max_ingest_events), nowMs());
  });
  tx();
  return getSystemSettings();
}

export type AiSettingsPublic = {
  configured: boolean;
  provider: AiProvider | null;
  model: string | null;
  base_url: string | null;
};

export function aiSettingsPublic(userId: string): AiSettingsPublic {
  const row = getDb().prepare("SELECT provider, model, base_url FROM ai_settings WHERE user_id = ?").get(userId) as
    | { provider: AiProvider; model: string; base_url: string }
    | undefined;
  return row
    ? { configured: true, provider: row.provider, model: row.model, base_url: row.base_url }
    : { configured: false, provider: null, model: null, base_url: null };
}

export function saveAiSettings(
  userId: string,
  input: { provider: AiProvider; model: string; base_url?: string; api_key: string }
): AiSettingsPublic {
  if (input.provider !== "anthropic" && input.provider !== "openai") {
    throw new HttpError(400, "Unsupported AI provider.", "invalid_provider");
  }
  const model = input.model.trim();
  const apiKey = input.api_key.trim();
  const defaultUrl = input.provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1";
  const baseUrl = (input.base_url?.trim() || defaultUrl).replace(/\/$/, "");
  if (!model || model.length > 120) throw new HttpError(400, "Enter a valid model name.", "invalid_model");
  const existing = getDb().prepare("SELECT api_key_cipher FROM ai_settings WHERE user_id = ?").get(userId) as
    | { api_key_cipher: string }
    | undefined;
  if (!existing && !apiKey) throw new HttpError(400, "Enter an API key.", "invalid_api_key");
  if (apiKey && (apiKey.length < 12 || apiKey.length > 512)) {
    throw new HttpError(400, "Enter a valid API key.", "invalid_api_key");
  }
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") throw new Error();
  } catch {
    throw new HttpError(400, "AI base URL must be HTTPS outside localhost.", "invalid_base_url");
  }
  const apiKeyCipher = apiKey ? encryptSecret(apiKey) : existing!.api_key_cipher;
  getDb().prepare(
    `INSERT INTO ai_settings (user_id, provider, model, base_url, api_key_cipher, updated_at)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
     provider = excluded.provider, model = excluded.model, base_url = excluded.base_url,
     api_key_cipher = excluded.api_key_cipher, updated_at = excluded.updated_at`
  ).run(userId, input.provider, model, baseUrl, apiKeyCipher, nowMs());
  return aiSettingsPublic(userId);
}

export function deleteAiSettings(userId: string): void {
  getDb().prepare("DELETE FROM ai_settings WHERE user_id = ?").run(userId);
}

export function modelForUser(userId: string): ChatModel | null {
  const row = getDb().prepare("SELECT provider, model, base_url, api_key_cipher FROM ai_settings WHERE user_id = ?").get(userId) as
    | { provider: AiProvider; model: string; base_url: string; api_key_cipher: string }
    | undefined;
  if (!row) return null;
  const opts = { apiKey: decryptSecret(row.api_key_cipher), model: row.model, baseUrl: row.base_url };
  return row.provider === "anthropic" ? new AnthropicModel(opts) : new OpenAiModel(opts);
}

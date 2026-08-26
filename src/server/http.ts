import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "./config";
import { getDb } from "./db";
import { sessionFromToken, workspaceFromApiKey, type SessionInfo, type User } from "./auth";
import { can, workspaceForUser, type WorkspaceAccess, type WorkspacePermission } from "./organizations";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string
  ) {
    super(message);
  }
}

function bearer(header: string | null): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== "bearer") return undefined;
  return token.trim();
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<User | null> {
  const context = await currentWorkspace();
  return context ? { ...context.user, id: context.access.dataOwnerUserId } : null;
}

export type RequestWorkspace = { user: User; access: WorkspaceAccess; via: "session" | "api_key" };

export async function currentWorkspace(): Promise<RequestWorkspace | null> {
  const hdrs = await headers();
  const key = bearer(hdrs.get("authorization"));
  if (key) {
    const resolved = workspaceFromApiKey(key);
    return resolved ? { ...resolved, via: "api_key" } : null;
  }
  const session = sessionFromToken(await readSessionToken());
  if (!session) return null;
  const access = workspaceForUser(session.user.id, session.activeOrganizationId);
  return access ? { user: session.user, access, via: "session" } : null;
}

export async function currentSession(): Promise<SessionInfo | null> {
  return sessionFromToken(await readSessionToken());
}

export async function requireUser(permission: WorkspacePermission = "read"): Promise<User> {
  const context = await currentWorkspace();
  if (!context) throw new HttpError(401, "Sign in or pass a Vera API key.", "unauthorized");
  if (!can(context.access.role, permission)) throw new HttpError(403, "Your organization role does not allow this action.", "forbidden");
  return { ...context.user, id: context.access.dataOwnerUserId };
}

export async function requireWorkspace(permission: WorkspacePermission = "read"): Promise<RequestWorkspace> {
  const context = await currentWorkspace();
  if (!context) throw new HttpError(401, "Sign in or pass a Vera API key.", "unauthorized");
  if (!can(context.access.role, permission)) throw new HttpError(403, "Your organization role does not allow this action.", "forbidden");
  return context;
}

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Cookie-authenticated mutating requests must come from this origin. Bearer keys skip this. */
export async function assertSameOriginIfCookie(): Promise<void> {
  const hdrs = await headers();
  if (bearer(hdrs.get("authorization"))) return;
  const configured = (getDb().prepare("SELECT value FROM system_settings WHERE key = 'public_url'").get() as { value: string } | undefined)?.value ?? "";
  const proto = hdrs.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  const host = hdrs.get("x-forwarded-host")?.split(",")[0].trim() || hdrs.get("host");
  const expected = originOf(configured) ?? originOf(host ? `${proto}://${host}` : null);
  const got = originOf(hdrs.get("origin")) ?? originOf(hdrs.get("referer"));
  if (!expected || !got || got !== expected) {
    throw new HttpError(403, "Cross-origin request blocked.", "csrf");
  }
}

export function requestIsSecure(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  return forwarded ? forwarded === "https" : new URL(req.url).protocol === "https:";
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return jsonError(err);
  }
}

export function jsonError(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "internal_error";
  if (message.includes("master_key") || message.includes("invalid secret envelope")) {
    return Response.json({ error: message, code: "config" }, { status: 500 });
  }
  console.error(err);
  return Response.json({ error: "Internal error.", code: "internal" }, { status: 500 });
}

export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new HttpError(413, "Payload too large.", "payload");
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, "Payload too large.", "payload");
  if (!text) return {};
  const contentType = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError(415, "Content-Type must be application/json.", "unsupported_media_type");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON.", "invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "JSON body must be an object.", "invalid_json");
  }
  return parsed;
}

export function codedError(err: unknown): never {
  if (err instanceof HttpError) throw err;
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
  const message = err instanceof Error ? err.message : "request_failed";
  const status = code === "email_taken" || code === "api_key_limit" ? 409 : code === "invalid_credentials" ? 401 : 400;
  if (code) throw new HttpError(status, message, code);
  throw err;
}

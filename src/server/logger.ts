type LogLevel = "info" | "warn" | "error";

const SECRET_KEYS = /authorization|cookie|password|secret|token|webhook|api[_-]?key/i;

function sanitized(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    SECRET_KEYS.test(key) ? "[redacted]" : typeof value === "string" ? value.slice(0, 1000) : value,
  ]));
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: "vera", event, ...sanitized(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

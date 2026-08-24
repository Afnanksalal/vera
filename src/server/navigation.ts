const LOCAL_ORIGIN = "https://vera.invalid";

/**
 * Accept only same-origin absolute paths for post-auth navigation. This keeps
 * login links useful without turning `next` into an open redirect.
 */
export function safeRedirectPath(value: string | string[] | undefined, fallback = "/app"): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN) return fallback;
    if (parsed.pathname === "/login" || parsed.pathname === "/signup") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

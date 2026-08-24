import "server-only";
import { DEFAULT_SITE_URL } from "@/lib/site";
import { getSystemSettings } from "@/server/settings";

/** Resolve the canonical installation URL without environment configuration. */
export function metadataBaseUrl(): URL {
  try {
    const configured = getSystemSettings().public_url;
    if (configured) return new URL(configured);
  } catch {
    // Metadata must remain renderable before the installation database exists.
  }
  return new URL(DEFAULT_SITE_URL);
}

import type { MetadataRoute } from "next";
import { metadataBaseUrl } from "@/server/site-metadata";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = metadataBaseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/app/", "/login", "/signup"],
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin,
  };
}

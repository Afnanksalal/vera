import type { MetadataRoute } from "next";
import { metadataBaseUrl } from "@/server/site-metadata";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = metadataBaseUrl();
  const now = new Date();
  return [
    { url: base.toString(), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/docs", base).toString(), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: new URL("/security", base).toString(), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: new URL("/privacy", base).toString(), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: new URL("/terms", base).toString(), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
  ];
}

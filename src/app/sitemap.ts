import type { MetadataRoute } from "next";
import { metadataBaseUrl } from "@/server/site-metadata";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: metadataBaseUrl().toString(), lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}

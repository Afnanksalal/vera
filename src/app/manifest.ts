import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vera · Agent Purchase Auditor",
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#fbfcfa",
    theme_color: "#009f6b",
    orientation: "any",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/art/vera-icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/art/vera-icon.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}

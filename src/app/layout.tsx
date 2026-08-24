import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { REPOSITORY_URL, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TITLE } from "@/lib/site";
import { metadataBaseUrl } from "@/server/site-metadata";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fraunces: a premium display face used for the wordmark and the bigger, bolder
// italic accent words woven through the headings.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export function generateMetadata(): Metadata {
  return {
    metadataBase: metadataBaseUrl(),
    applicationName: SITE_NAME,
    title: { default: SITE_TITLE, template: "%s · Vera" },
    description: SITE_DESCRIPTION,
    keywords: SITE_KEYWORDS,
    authors: [{ name: "Afnan K Salal", url: REPOSITORY_URL }],
    creator: "Afnan K Salal",
    publisher: SITE_NAME,
    category: "finance",
    referrer: "origin-when-cross-origin",
    formatDetection: { email: false, address: false, telephone: false },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/icon.png", type: "image/png" }],
      apple: [{ url: "/art/vera-icon.png", type: "image/png", sizes: "1024x1024" }],
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      locale: "en_IN",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Vera, the audit and reconciliation layer for AI agent purchases" }],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [{ url: "/twitter-image", alt: "Vera, the audit and reconciliation layer for AI agent purchases" }],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    other: {
      "mobile-web-app-capable": "yes",
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-title": SITE_NAME,
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#009f6b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

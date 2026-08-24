import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LICENSE_URL, REPOSITORY_URL, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site";
import { installationHasUser } from "@/server/auth";
import { currentUser } from "@/server/http";
import { metadataBaseUrl } from "@/server/site-metadata";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { url: "/", title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { title: SITE_TITLE, description: SITE_DESCRIPTION },
};

const CHECKS = [
  { name: "Authorized", desc: "The signed mandate allowed this agent to spend this amount, in this category, at this time." },
  { name: "Cart bound", desc: "The merchant-signed cart matches the captured payment down to the paise." },
  { name: "Receipted", desc: "A durable receipt exists for the captured payment." },
  { name: "Idempotent", desc: "One payment exists per idempotency key, so a retry cannot double-charge." },
  { name: "Settled", desc: "The processor settlement is present and equals the expected amount." },
  { name: "Banked", desc: "A real bank credit reconciles to the settlement without invented evidence." },
  { name: "Refund policy", desc: "Refunds retain mandate provenance without a chargeback collision." },
];

const STEPS = [
  { name: "Investigate", body: "Vera’s AI investigator gathers evidence, explains suspicious payments, and proposes verdicts for independent verification." },
  { name: "Challenge", body: "Vera replays every cited lookup and independently re-derives every decision from the stored records." },
  { name: "Commit", body: "Only the verifier can update claim status. Every close is hash-chained and signed by this installation." },
];

export default async function HomePage() {
  const user = await currentUser();
  const initialized = installationHasUser();
  const publicUrl = metadataBaseUrl().toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${publicUrl}#website`,
        url: publicUrl,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en-IN",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${publicUrl}#software`,
        name: SITE_NAME,
        url: publicUrl,
        description: SITE_DESCRIPTION,
        applicationCategory: "FinanceApplication",
        applicationSubCategory: "Payment audit and reconciliation",
        operatingSystem: "Web",
        isAccessibleForFree: true,
        license: LICENSE_URL,
        codeRepository: REPOSITORY_URL,
        image: new URL("/opengraph-image", publicUrl).toString(),
        featureList: [
          "Signed purchase mandates",
          "Merchant-signed carts and receipts",
          "Razorpay payment and settlement synchronization",
          "Bank deposit reconciliation",
          "Deterministically verified AI investigations",
          "Signed and replayable audit bundles",
        ],
      },
    ],
  };
  const primaryCta = user
    ? { href: "/app", label: "Open app" }
    : initialized
      ? { href: "/login", label: "Sign in" }
      : { href: "/signup", label: "Set up Vera" };

  return (
    <div data-landing-page>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <section className="relative overflow-hidden border-b border-border/80">
        <div className="pointer-events-none absolute inset-0 grid-faint" aria-hidden />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-5 pb-14 pt-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="text-5xl font-medium leading-[1.05] tracking-tight text-balance sm:text-6xl">
              The ledger that <span className="accent text-brand">checks</span> what your agents bought.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Vera puts the proof scattered across Razorpay, AP2, ACP, x402,
              mandates, receipts, settlements, and bank credits back together—and
              flags anything that does not add up.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={primaryCta.href} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-[15px]")}>
                {primaryCta.label}
              </Link>
              <Link href="/#how" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-[15px]")}>
                How she works
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Self-hosted, configured in the browser, and backed by a signed audit trail.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-6 rounded-full bg-brand/15 blur-3xl" aria-hidden />
            <Image
              src="/art/vera-mascot.png"
              alt="Vera, a mint-green owl auditor holding a ledger and a magnifying glass"
              width={640}
              height={640}
              priority
              className="relative w-full drop-shadow-sm"
            />
          </div>
        </div>
      </section>

      <section id="story" className="scroll-mt-20 border-b border-border/80 bg-secondary/40">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
                An agent buys. Vera <span className="accent text-brand">audits</span> every step.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                Razorpay webhooks, browser imports, and integration API calls enter
                the same canonical pipeline. Vera follows the paper trail from the
                signed intent to the cart, receipt, settlement, and bank credit.
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Missing evidence stays missing. The production runtime never fills
                gaps with fixtures, demos, or synthetic records.
              </p>
            </div>
            <Image
              src="/art/vera-hero.png"
              alt="A shopping robot buying online while Vera inspects a chain of receipts"
              width={1024}
              height={576}
              className="w-full"
            />
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 border-y border-border/80 bg-secondary/40">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
              AI proposes. Vera <span className="accent text-brand">verifies</span>.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A configured model can reason over the evidence, but a deterministic
              verifier re-derives every verdict. The model can be useful without
              being trusted to mutate the ledger.
            </p>
          </div>
          <Image
            src="/art/vera-pipeline.png"
            alt="A scribe proposes a claim, an auditor re-checks it, and a judge commits it"
            width={1024}
            height={576}
            className="mt-8 w-full"
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.name} className="rounded-2xl border border-border bg-card p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/12 font-mono text-sm font-semibold text-brand">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold">{step.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="checks" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-16 sm:px-6">
        <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          Vera runs <span className="accent text-brand">seven</span> checks on every sale.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Each claim is proven, excepted, or explicitly abstained with evidence. Nothing is quietly dropped.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((check, index) => (
            <div key={check.name} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/12 font-mono text-xs font-semibold text-brand">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold">{check.name}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{check.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border/80 bg-secondary/40">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
              Do not trust Vera. <span className="accent">Check her.</span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Every close carries its evidence, chained events, signer identity,
              and verifier output. Download or verify the signed bundle directly
              from the web console—no local command workflow required.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-8">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Installation trust</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">One stable signing identity</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The encrypted Ed25519 private key remains in the persistent data
              volume. The public key and complete bundle verifier are available in Closes.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-foreground px-8 py-14 text-background">
          <div className="grid items-center gap-8 sm:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
                Let Vera <span className="accent text-brand">close</span> your agents&rsquo; books.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-background/70">
                {initialized
                  ? "Sign in to configure integrations and operate the complete ledger from the browser."
                  : "Create the installation owner, configure integrations in Settings, and operate the complete ledger from the browser."}
              </p>
              <div className="mt-7">
                <Link href={primaryCta.href} className="inline-flex h-11 items-center rounded-lg bg-brand px-5 text-[15px] font-semibold text-brand-foreground transition-opacity hover:opacity-90">
                  {primaryCta.label}
                </Link>
              </div>
            </div>
            <Image src="/art/vera-icon.png" alt="Vera" width={140} height={140} className="hidden rounded-2xl sm:block" />
          </div>
        </div>
      </section>
    </div>
  );
}

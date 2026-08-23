import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getLedgerSnapshot } from "@/lib/mandate-server";
import { cn } from "@/lib/utils";

const CHECKS = [
  { name: "Authorized", desc: "The mandate actually allowed this agent to spend this much, on this, in time." },
  { name: "Cart bound", desc: "The signed cart matches what was charged, to the paise." },
  { name: "Receipted", desc: "A durable receipt exists. x402 loves to skip this." },
  { name: "Idempotent", desc: "One payment per key, so a retry never double-charges." },
  { name: "Settled", desc: "What the processor paid out equals the cart." },
  { name: "Banked", desc: "One bank credit, tagged to this intent, not a mixed lump." },
  { name: "Refund policy", desc: "Refunds cite a mandate, with no chargeback collision." },
];

const STEPS = [
  { name: "An AI agent investigates", body: "A Claude model reads each purchase by calling tools, gathers evidence, and proposes a verdict. It works like an analyst, not a black box." },
  { name: "Vera re-checks everything", body: "She reruns every lookup from scratch and re-derives the answer. If the model's story does not hold, she flags it." },
  { name: "The judge commits", body: "A verdict is recorded only when the evidence is real, the math holds, and Vera agrees. A hallucination cannot pass. Then it is chained and signed." },
];

export default function HomePage() {
  const snap = getLedgerSnapshot();
  const e = snap.eval;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/80">
        <div className="pointer-events-none absolute inset-0 grid-faint" aria-hidden />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-5 pb-14 pt-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="text-5xl font-medium leading-[1.05] tracking-tight text-balance sm:text-6xl">
              The ledger that{" "}
              <span className="accent text-brand">checks</span> what
              your agents bought.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              When an AI agent buys something, the money lands like any other
              payout while the proof scatters across mandates, tokens, and
              receipts. Vera puts it back together and flags anything that does
              not add up.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/ledger" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-[15px]")}>
                Watch Vera close a week
              </Link>
              <Link
                href="/#how"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-[15px]")}
              >
                How she works
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Every verdict is re-derived from the raw rows and recorded, so
              anyone can re-check a close.
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

      {/* Story band */}
      <section id="story" className="scroll-mt-20 border-b border-border/80 bg-secondary/40">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
                An agent buys. Vera{" "}
                <span className="accent text-brand">audits</span> every step.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                The robot checks out on AP2, ACP, or x402. Vera follows the paper
                trail from the intent that authorized it, to the signed cart, the
                receipt, the settlement, and the bank credit, and marks each hop.
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                A plain amount-and-date match, the way most reconciliation works,
                would wave through an overspent mandate, a missing receipt, or a
                double charge. Vera catches them.
              </p>
            </div>
            <Image
              src="/art/vera-hero.png"
              alt="A shopping robot buying online while Vera inspects a chain of receipts, with green checks and one red flag"
              width={1024}
              height={576}
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* Product preview */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            This is Vera closing a{" "}
            <span className="accent text-brand">real</span> week.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            A seeded week of agent purchases, closed live. Every number here is
            computed by the engine on this request, not typed into a slide.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 rounded-md bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
              vera.app/ledger
            </span>
          </div>
          <div className="p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { v: String(e.claimsProcessed), l: "checks closed" },
                { v: `${Math.round(e.closureRate * 100)}%`, l: "resolved" },
                { v: `${e.plantedCaught}/${e.plantedSales}`, l: "faults caught" },
                { v: String(e.falseProve), l: "wrongly passed" },
              ].map((m) => (
                <div key={m.l} className="rounded-xl border border-border bg-secondary/30 p-4">
                  <div className="text-3xl font-semibold tracking-tight tabular-nums">{m.v}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{m.l}</div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                What Vera flagged
              </p>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 font-mono text-xs sm:grid-cols-2">
                {Object.entries(e.exceptionsByCode)
                  .sort()
                  .map(([code, count]) => (
                    <li key={code} className="flex justify-between gap-4">
                      <span>{code}</span>
                      <span className="text-muted-foreground tabular-nums">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/ledger" className={cn(buttonVariants({ size: "sm" }), "h-9 px-4")}>
                Open the live ledger
              </Link>
              <span className="text-sm text-muted-foreground">
                A naive match misses {e.naive.falseClean} of {e.plantedSales}. Vera misses none.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-border/80 bg-secondary/40">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
              AI proposes. Vera{" "}
              <span className="accent text-brand">verifies</span>.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A live language model does the reasoning and tool use. Then a
              deterministic verifier re-derives every verdict from the raw rows,
              so the AI can be smart without being trusted. A wrong call is
              caught, not booked.
            </p>
          </div>
          <Image
            src="/art/vera-pipeline.png"
            alt="A scribe robot writes a claim, a detective owl re-checks it, a judge stamps it approved"
            width={1024}
            height={576}
            className="mt-8 w-full"
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.name} className="rounded-2xl border border-border bg-card p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/12 font-mono text-sm font-semibold text-brand">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold">{step.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Checks */}
      <section id="checks" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-16 sm:px-6">
        <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          Vera runs{" "}
          <span className="accent text-brand">seven</span> checks on every sale.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Each one is proven or flagged with evidence. Nothing is quietly dropped.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((check, i) => (
            <div key={check.name} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/12 font-mono text-xs font-semibold text-brand">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold">{check.name}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{check.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="border-y border-border/80 bg-secondary/40">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
              Do not trust Vera.{" "}
              <span className="accent">Check her.</span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Every lookup and verdict is hash-chained, so any edit or deletion is
              detectable. The chain is signed and packed into a bundle. A stranger
              recomputes the chain, checks the signature, and replays the whole
              close, with no trust in the machine that produced it.
            </p>
            <div className="mt-7 rounded-xl border border-border bg-[#0d1117] p-5 font-mono text-[13px] leading-relaxed text-neutral-200">
              <div className="text-neutral-500"># export and re-verify a run, offline</div>
              <div>
                <span className="text-brand">$</span> npm run mandate bundle
              </div>
              <div>
                <span className="text-brand">$</span> npm run mandate verify-bundle
              </div>
              <div className="mt-2 text-emerald-400">RESULT: VERIFIED</div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="text-6xl font-semibold tracking-tight tabular-nums">
              {snap.chain.events.toLocaleString()}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              events chained on the demo run, currently{" "}
              <span className="font-medium text-foreground">
                {snap.chain.ok ? "intact" : "broken"}
              </span>
            </p>
            <div className="mt-6 rounded-lg border border-border bg-secondary/40 p-3 font-mono text-[11px] break-all text-muted-foreground">
              head {snap.chain.head}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-foreground px-8 py-14 text-background">
          <div className="grid items-center gap-8 sm:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
                Let Vera{" "}
                <span className="accent text-brand">close</span> your
                agents&rsquo; books.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-background/70">
                Open the live ledger to watch the scribe, the skeptic, and the
                judge resolve a full week, then read the exception queue.
              </p>
              <div className="mt-7">
                <Link
                  href="/ledger"
                  className="inline-flex h-11 items-center rounded-lg bg-brand px-5 text-[15px] font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                >
                  Open the live ledger
                </Link>
              </div>
            </div>
            <Image
              src="/art/vera-icon.png"
              alt="Vera"
              width={140}
              height={140}
              className="hidden rounded-2xl sm:block"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

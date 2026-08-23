import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AiInvestigator } from "@/components/ai-investigator";
import { getLedgerSnapshot } from "@/lib/mandate-server";
import { modelStatus } from "@/mandate/llm";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live ledger",
  description:
    "A full close run in the browser: closer, challenger, verifier, the exception queue, and a tamper-evident audit chain.",
};

const CLAIM_ORDER = [
  "AUTHORIZED",
  "CART_BOUND",
  "RECEIPTED",
  "IDEMPOTENT",
  "SETTLED",
  "BANKED",
  "REFUND_POLICY",
] as const;

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "ok" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          tone === "ok" && "text-[color:var(--ok)]",
          tone === "bad" && "text-[color:var(--bad)]"
        )}
      >
        {v}
      </dd>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-semibold tracking-tight tabular-nums",
          tone === "ok" && "text-[color:var(--ok)]",
          tone === "bad" && "text-[color:var(--bad)]"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function LedgerPage() {
  const snap = getLedgerSnapshot();
  const e = snap.eval;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Live close, seed {snap.seed}
        </span>
        <span
          className={cn(
            "rounded-full px-3 py-1 font-medium",
            e.pass ? "bg-[color:var(--ok)]/12 text-[color:var(--ok)]" : "bg-[color:var(--bad)]/12 text-[color:var(--bad)]"
          )}
        >
          {e.pass ? "All gates pass" : "Gate failure"}
        </span>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <Image
          src="/art/vera-mascot.png"
          alt="Vera"
          width={72}
          height={72}
          className="hidden shrink-0 sm:block"
        />
        <div>
          <h1 className="text-4xl font-medium tracking-tight text-balance sm:text-5xl">
            Vera&rsquo;s <span className="accent text-brand">live</span> ledger
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            The scribe, the skeptic, and the judge run on a seeded week of agent
            purchases. Every verdict is committed only on evidence, then
            hash-chained and signed. Numbers below are computed on request.
          </p>
        </div>
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Claims processed" value={String(e.claimsProcessed)} hint={`${e.agentSales} sales, 7 claims each`} />
        <Stat label="Sale-claim closure" value={pct(e.closureRate)} hint={`${e.closed} of ${e.claimsProcessed}`} tone="ok" />
        <Stat label="Planted recall" value={pct(e.plantedRecall)} hint={`${e.plantedCaught} of ${e.plantedSales}, right code`} tone="ok" />
        <Stat label="False prove" value={String(e.falseProve)} hint="broken mandates never pass" tone={e.falseProve === 0 ? "ok" : "bad"} />
      </dl>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Naive amount + date join" value={`${e.naive.falseClean} missed`} hint={`catches ${e.naive.caught} of ${e.plantedSales}`} tone="bad" />
        <Stat label="Audit chain" value={snap.chain.ok ? "intact" : "broken"} hint={`${snap.chain.events.toLocaleString()} events, ed25519 signed`} tone={snap.chain.ok ? "ok" : "bad"} />
        <Stat label="Tool calls per sale" value={`p95 ${e.toolCalls.p95}`} hint={`${e.toolCalls.total.toLocaleString()} total, deterministic`} />
      </div>

      <section className="mt-12 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">
            Combinatorial <span className="accent text-brand">matching</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            N:1 settlement to bank, solver-verified. A plain 1:1 matcher cannot do these.
          </p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <Row k="Credits matched" v={`${snap.matching.matched}/${snap.matching.credits}`} />
            <Row k="N:1 groupings" v={String(snap.matching.n_to_one)} />
            <Row k="Ambiguous (abstained)" v={String(snap.matching.ambiguous)} />
            <Row k="Unexplained" v={String(snap.matching.unexplained)} />
            <Row k="Matched value" v={snap.matching.matched_value} />
            <Row k="Verifier" v={snap.matching.verify_ok ? "consistent" : "broken"} tone={snap.matching.verify_ok ? "ok" : "bad"} />
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">
            Conformal <span className="accent text-brand">risk control</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Accept only matches whose error is provably bounded; abstain the rest to humans.
          </p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <Row k="Target error (α)" v={`${Math.round(snap.risk.alpha * 100)}%`} />
            <Row k="Guaranteed bound" v={`${(snap.risk.guaranteed_error * 100).toFixed(1)}%`} tone="ok" />
            <Row k="Held-out error" v={`${(snap.risk.empirical_error * 100).toFixed(1)}%`} tone="ok" />
            <Row k="Coverage (accepted)" v={`${(snap.risk.coverage * 100).toFixed(0)}%`} />
            <Row k="Sent to humans" v={String(snap.risk.abstained)} />
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">
            Open-world <span className="accent text-brand">anomaly</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A pattern the seven checks miss, discovered and routed to review.
          </p>
          {snap.anomaly.discovered ? (
            <div className="mt-4 text-sm">
              <div className="font-medium">{snap.anomaly.discovered.name}</div>
              <p className="mt-1 text-muted-foreground">{snap.anomaly.discovered.description}</p>
              <p className="mt-2 font-mono text-xs text-[color:var(--bad)]">
                fires on {snap.anomaly.discovered.fires.length} sales ({(snap.anomaly.discovered.coverage * 100).toFixed(0)}%)
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{snap.anomaly.discovered.fires.join(", ")}</p>
              <span className="mt-3 inline-block rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                status: {snap.anomaly.discovered.status.replace("_", " ")}
              </span>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No anomaly discovered.</p>
          )}
        </div>
      </section>

      <div className="mt-6">
        <AiInvestigator
          sales={snap.plantedSales.map((s) => ({ sale_id: s.sale_id, fault: s.fault }))}
          status={modelStatus()}
        />
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Exception queue</h2>
            <span className="text-xs text-muted-foreground">{snap.exceptions.length} open</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The deliverable is this list, not a cherry-picked match.
          </p>
          <div className="mt-4 max-h-[24rem] space-y-2 overflow-auto pr-1">
            {snap.exceptions.map((ex) => (
              <div
                key={ex.claim_id}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
              >
                <div>
                  <div className="font-mono text-xs font-semibold text-[color:var(--bad)]">{ex.code}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">claim {ex.type}</div>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">{ex.sale_id}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">External records</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AP2, ACP, and x402 payloads ingested through the adapters and closed
            the same way as the fixture.
          </p>
          <div className="mt-4 space-y-2">
            {snap.external.map((ex) => (
              <div
                key={`${ex.sale_id}:${ex.type}`}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
              >
                <div>
                  <div className="font-mono text-xs font-semibold text-[color:var(--bad)]">{ex.code}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">claim {ex.type}</div>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">{ex.sale_id}</span>
              </div>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-medium">Exceptions by code</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(e.exceptionsByCode)
              .sort()
              .map(([code, count]) => (
                <span key={code} className="rounded-full border border-border px-3 py-1 font-mono text-xs">
                  {code} <span className="text-muted-foreground">{count}</span>
                </span>
              ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Planted-fault sales</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Exactly one claim breaks per planted sale. The rest still prove.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-2 py-2 font-medium">sale</th>
                <th className="px-2 py-2 font-medium">fault</th>
                {CLAIM_ORDER.map((t) => (
                  <th key={t} className="px-2 py-2 text-center font-medium">
                    {t.slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snap.plantedSales.map((sale) => (
                <tr key={sale.sale_id} className="border-t border-border">
                  <td className="px-2 py-2 font-mono text-muted-foreground">{sale.sale_id}</td>
                  <td className="px-2 py-2 font-mono text-[color:var(--bad)]">{sale.fault}</td>
                  {sale.claims.map((c) => (
                    <td key={c.type} className="px-2 py-2 text-center">
                      {c.status === "EXCEPTED" ? (
                        <span className="text-[color:var(--bad)]">✕</span>
                      ) : c.status === "PROVEN" ? (
                        <span className="text-[color:var(--ok)]">✓</span>
                      ) : (
                        <span className="text-muted-foreground">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <a href="/api/ledger" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
          Open /api/ledger
        </a>
        <Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "h-10 px-4")}>
          Back to overview
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Reproduce locally with{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm test</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run mandate:eval</code>, and{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run mandate verify-bundle</code>.
      </p>
    </div>
  );
}

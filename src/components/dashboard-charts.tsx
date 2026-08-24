import { ArrowUpRight, CircleCheckBig, Sparkles } from "lucide-react";
import { friendlyClaim } from "@/components/console-ui";
import type { DashboardAnalytics, ReportTrendPoint } from "@/server/dashboard";
import type { CloseSummary } from "@/server/ledger";
import { inr } from "@/mandate/types";

function linePath(points: ReportTrendPoint[], key: "passed_percent" | "attention_percent" | "inconclusive_percent"): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M 18 ${92 - points[0][key] * 0.7} L 282 ${92 - points[0][key] * 0.7}`;
  return points.map((point, index) => {
    const x = 18 + (index / (points.length - 1)) * 264;
    const y = 92 - point[key] * 0.7;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function TrendChart({ points }: { points: ReportTrendPoint[] }) {
  const passed = linePath(points, "passed_percent");
  const attention = linePath(points, "attention_percent");
  const inconclusive = linePath(points, "inconclusive_percent");
  const labels = points.length > 1 ? [points[0], points[points.length - 1]] : points;
  return <div>
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-ok"/>Passed</span>
      <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-bad"/>Needs attention</span>
      <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-amber-500"/>Inconclusive</span>
      <span className="ml-auto">Last {points.length} {points.length === 1 ? "report" : "reports"}</span>
    </div>
    <div className="relative overflow-hidden rounded-xl bg-muted/35 px-2 pt-2">
      <svg viewBox="0 0 300 112" role="img" aria-label="Passed, attention, and inconclusive rates across stored reports" className="h-44 w-full overflow-visible">
        <defs>
          <linearGradient id="vera-passed-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ok)" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="var(--ok)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[22, 57, 92].map((y, index) => <g key={y}><line x1="18" x2="282" y1={y} y2={y} stroke="var(--border)" strokeWidth="0.8"/><text x="1" y={y + 3} fontSize="7" fill="var(--muted-foreground)">{[100, 50, 0][index]}%</text></g>)}
        {passed ? <><path d={`${passed} L 282 92 L 18 92 Z`} fill="url(#vera-passed-area)"/><path d={passed} fill="none" stroke="var(--ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></> : null}
        {attention ? <path d={attention} fill="none" stroke="var(--bad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4"/> : null}
        {inconclusive ? <path d={inconclusive} fill="none" stroke="oklch(0.72 0.14 75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 4"/> : null}
        {points.map((point, index) => {
          const x = points.length === 1 ? 150 : 18 + (index / (points.length - 1)) * 264;
          const y = 92 - point.passed_percent * 0.7;
          return <circle key={point.id} cx={x} cy={y} r="3" fill="var(--card)" stroke="var(--ok)" strokeWidth="2"><title>{point.passed_percent}% passed · {point.payments} payments</title></circle>;
        })}
      </svg>
      <div className="flex justify-between px-4 pb-3 text-[11px] text-muted-foreground">{labels.map((point) => <span key={point.id}>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(point.created_at))}</span>)}</div>
    </div>
    {points.length === 1 ? <p className="mt-3 text-xs text-muted-foreground">The trend becomes more useful as new reports are created. This line shows the current report only.</p> : null}
  </div>;
}

function ResultMix({ close }: { close: CloseSummary }) {
  const total = close.proven + close.excepted + close.abstained;
  const passed = total ? close.proven / total * 100 : 0;
  const attention = total ? close.excepted / total * 100 : 0;
  const background = `conic-gradient(var(--ok) 0 ${passed}%, var(--bad) ${passed}% ${passed + attention}%, oklch(0.72 0.14 75) ${passed + attention}% 100%)`;
  return <div className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col xl:flex-row">
    <div className="relative size-36 shrink-0 rounded-full p-[13px]" style={{ background }} role="img" aria-label={`${close.proven} passed, ${close.excepted} need attention, ${close.abstained} inconclusive`}>
      <div className="flex size-full flex-col items-center justify-center rounded-full bg-card shadow-[inset_0_0_0_1px_var(--border)]"><span className="text-3xl font-semibold tabular-nums">{total}</span><span className="text-xs text-muted-foreground">total checks</span></div>
    </div>
    <dl className="grid w-full gap-3 text-sm">
      <div className="flex items-center justify-between gap-5"><dt className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-ok"/>Passed</dt><dd className="font-semibold tabular-nums">{close.proven}</dd></div>
      <div className="flex items-center justify-between gap-5"><dt className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-bad"/>Needs attention</dt><dd className="font-semibold tabular-nums">{close.excepted}</dd></div>
      <div className="flex items-center justify-between gap-5"><dt className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-amber-500"/>Inconclusive</dt><dd className="font-semibold tabular-nums">{close.abstained}</dd></div>
    </dl>
  </div>;
}

export function DashboardCharts({ analytics, close }: { analytics: DashboardAnalytics; close: CloseSummary }) {
  const maxIssueCount = Math.max(...analytics.issues.map((point) => point.count), 1);
  return <section aria-labelledby="operational-pulse-title" className="grid gap-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Live from your reports</p><h2 id="operational-pulse-title" className="mt-1 font-display text-2xl font-semibold tracking-tight">Operational pulse</h2></div>
      {analytics.payments_with_issues > 0 ? <div className="flex items-center gap-2 rounded-full bg-bad/[0.07] px-3 py-1.5 text-xs font-medium text-bad"><ArrowUpRight aria-hidden className="size-3.5"/>{inr(analytics.payment_value_with_issues)} across {analytics.payments_with_issues} flagged {analytics.payments_with_issues === 1 ? "payment" : "payments"}</div> : <div className="flex items-center gap-2 rounded-full bg-ok/[0.08] px-3 py-1.5 text-xs font-medium text-ok"><CircleCheckBig aria-hidden className="size-3.5"/>No payment value is currently flagged</div>}
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)]">
      <article className="rounded-2xl border border-border bg-card p-5 shadow-[0_16px_50px_-38px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="mb-5"><h3 className="font-semibold">Report health</h3><p className="mt-1 text-sm text-muted-foreground">Verified outcomes over time—not a forecast.</p></div>
        <TrendChart points={analytics.trend}/>
      </article>
      <article className="rounded-2xl border border-border bg-card p-5 shadow-[0_16px_50px_-38px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="mb-6"><h3 className="font-semibold">Latest result mix</h3><p className="mt-1 text-sm text-muted-foreground">Every check in the newest report.</p></div>
        <ResultMix close={close}/>
      </article>
    </div>
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_50px_-38px_rgba(15,23,42,0.35)]">
      <div className="grid lg:grid-cols-[minmax(15rem,0.62fr)_minmax(0,1.38fr)]">
        <div className="relative overflow-hidden border-b border-border bg-brand/[0.045] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div aria-hidden className="absolute -right-16 -top-16 size-48 rounded-full bg-brand/10 blur-3xl"/>
          <Sparkles aria-hidden className="relative size-5 text-brand"/>
          <h3 className="relative mt-4 font-display text-2xl font-semibold">Where to focus</h3>
          <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">Checks with the most missing, conflicting, or inconclusive evidence in the latest report.</p>
        </div>
        <div className="p-5 sm:p-6">
          {analytics.issues.length ? <div className="grid gap-4">{analytics.issues.map((point) => <div key={point.type} className="grid grid-cols-[minmax(8rem,0.75fr)_minmax(7rem,1.25fr)_2rem] items-center gap-3"><span className="truncate text-sm font-medium">{friendlyClaim(point.type)}</span><div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full min-w-2 rounded-full bg-gradient-to-r from-bad/70 to-bad" style={{ width: `${Math.max(8, point.count / maxIssueCount * 100)}%` }}/></div><span className="text-right text-sm font-semibold tabular-nums text-bad">{point.count}</span></div>)}</div> : <div className="flex min-h-28 items-center justify-center gap-3 text-sm text-muted-foreground"><CircleCheckBig aria-hidden className="size-5 text-ok"/>Every check passed in the latest report.</div>}
        </div>
      </div>
    </article>
  </section>;
}

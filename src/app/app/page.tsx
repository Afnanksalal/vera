import Link from "next/link";
import { AlertCircle, CheckCircle2, FileJson2, RefreshCw } from "lucide-react";
import { CloseButton } from "@/components/app-actions";
import { IngestForm } from "@/components/ingest-form";
import { EmptyState, Metric, PageHeader, Panel, formatDateTime, friendlyClaim, friendlyCode } from "@/components/console-ui";
import { latestClose, listCloses, listReviews, recordsForUser } from "@/server/ledger";
import { currentUser } from "@/server/http";
import { razorpayPublic } from "@/server/razorpay";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardCharts } from "@/components/dashboard-charts";
import { buildDashboardAnalytics } from "@/server/dashboard";
import { Disclosure } from "@/components/ui/disclosure";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const user = await currentUser(); if (!user) return null;
  const records = recordsForUser(user.id);
  const events = records.length;
  const close = latestClose(user.id);
  const open = listReviews(user.id, "open");
  const razorpay = razorpayPublic(user.id);
  return <div className="grid gap-8">
    <PageHeader title="Overview" />
    {events === 0 ? <EmptyState icon={RefreshCw} title="No payment records" action={<Link href="/app/settings#razorpay" className={cn(buttonVariants(), "h-10")}>{razorpay.configured ? "Sync Razorpay" : "Connect Razorpay"}</Link>} /> : !close ? <Panel className="flex flex-col gap-5 bg-brand/[0.035] sm:flex-row sm:items-center sm:justify-between"><p className="text-lg font-semibold">{events} records ready</p><CloseButton /></Panel> : open.length > 0 ? <Panel className="flex flex-col gap-5 border-bad/20 bg-bad/[0.025] sm:flex-row sm:items-center sm:justify-between"><p className="text-lg font-semibold">{open.length} {open.length === 1 ? "issue" : "issues"} need review</p><Link href="/app/review" className={cn(buttonVariants(), "h-10")}>Review issues</Link></Panel> : <Panel className="flex flex-col gap-5 border-ok/20 bg-ok/[0.025] sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><CheckCircle2 aria-hidden className="size-5 text-ok"/><p className="text-lg font-semibold">All checks passed</p></div><CloseButton /></Panel>}
    <section aria-label="Latest check summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Imported records" value={events}/><Metric label="Checks passed" value={close?.summary.proven ?? 0} tone="good"/><Metric label="Needs attention" value={close?.summary.excepted ?? 0} tone="bad"/><Metric label="Inconclusive" value={close?.summary.abstained ?? 0}/></section>
    {close ? <DashboardCharts analytics={buildDashboardAnalytics(close.claims, listCloses(user.id), records)} close={close.summary}/> : null}
    {open.length > 0 ? <Panel><div className="flex items-center justify-between gap-4"><h2 className="font-semibold">Needs attention</h2><Link href="/app/review" className="shrink-0 text-sm font-medium text-brand hover:underline">View all</Link></div><ul className="mt-5 divide-y divide-border">{open.slice(0, 5).map((issue) => <li key={issue.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-bad"/><div className="min-w-0"><p className="text-sm font-medium">{friendlyClaim(issue.claim_type)}</p><p className="mt-0.5 break-words text-sm text-muted-foreground">{friendlyCode(issue.code)} · Payment <span className="break-all font-mono text-xs">{issue.sale_id}</span></p></div></li>)}</ul></Panel> : close ? <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Latest report</h2><p className="mt-1 text-sm text-muted-foreground">{close.summary.sales} payments · {formatDateTime(close.summary.created_at)}</p></div><Link href={`/app/closes/${close.summary.id}`} className={cn(buttonVariants({ variant: "outline" }), "h-10")}>Open report</Link></Panel> : null}
    <Disclosure title="Manual import" leading={<FileJson2 aria-hidden className="size-4"/>} summary="AP2, ACP, or x402" className="rounded-2xl border border-border bg-card" triggerClassName="p-5" panelClassName="border-t border-border p-5"><IngestForm /></Disclosure>
  </div>;
}

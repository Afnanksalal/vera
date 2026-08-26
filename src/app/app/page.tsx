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
    <PageHeader title="Overview" description="See what needs attention and keep your payment records up to date." />
    {events === 0 ? <EmptyState icon={RefreshCw} title="Bring in your first payment records" description="Connect Razorpay for automatic syncing, or import an AP2, ACP, or x402 JSON file. Vera will then check the evidence and surface anything that needs you." action={<Link href="/app/settings#razorpay" className={cn(buttonVariants(), "h-10")}>{razorpay.configured ? "Sync Razorpay" : "Connect Razorpay"}</Link>} /> : !close ? <Panel className="flex flex-col gap-5 bg-brand/[0.035] sm:flex-row sm:items-center sm:justify-between"><div><p className="text-lg font-semibold">Your records are ready to check</p><p className="mt-1 text-sm text-muted-foreground">Vera found {events} imported records. Run the checks to identify missing or conflicting evidence.</p></div><CloseButton /></Panel> : open.length > 0 ? <Panel className="flex flex-col gap-5 border-bad/20 bg-bad/[0.025] sm:flex-row sm:items-center sm:justify-between"><div><p className="text-lg font-semibold">{open.length} {open.length === 1 ? "issue needs" : "issues need"} your review</p><p className="mt-1 text-sm text-muted-foreground">The checks finished, but some payments have missing or conflicting evidence.</p></div><Link href="/app/review" className={cn(buttonVariants(), "h-10")}>Review issues</Link></Panel> : <Panel className="flex flex-col gap-5 border-ok/20 bg-ok/[0.025] sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CheckCircle2 aria-hidden className="mt-0.5 size-5 text-ok"/><div><p className="text-lg font-semibold">Latest checks are complete</p><p className="mt-1 text-sm text-muted-foreground">No open issues remain from the latest report.</p></div></div><CloseButton /></Panel>}
    <section aria-label="Latest check summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Imported records" value={events}/><Metric label="Checks passed" value={close?.summary.proven ?? 0} tone="good"/><Metric label="Needs attention" value={close?.summary.excepted ?? 0} tone="bad"/><Metric label="Inconclusive" value={close?.summary.abstained ?? 0}/></section>
    {close ? <DashboardCharts analytics={buildDashboardAnalytics(close.claims, listCloses(user.id), records)} close={close.summary}/> : null}
    {open.length > 0 ? <Panel><div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold">What needs attention</h2><p className="mt-1 text-sm text-muted-foreground">Start with the newest issues.</p></div><Link href="/app/review" className="shrink-0 text-sm font-medium text-brand hover:underline">View all</Link></div><ul className="mt-5 divide-y divide-border">{open.slice(0, 5).map((issue) => <li key={issue.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-bad"/><div className="min-w-0"><p className="text-sm font-medium">{friendlyClaim(issue.claim_type)}</p><p className="mt-0.5 break-words text-sm text-muted-foreground">{friendlyCode(issue.code)} · Payment <span className="break-all font-mono text-xs">{issue.sale_id}</span></p></div></li>)}</ul></Panel> : close ? <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Latest report</h2><p className="mt-1 text-sm text-muted-foreground">Checked {close.summary.sales} payments on {formatDateTime(close.summary.created_at)}.</p></div><Link href={`/app/closes/${close.summary.id}`} className={cn(buttonVariants({ variant: "outline" }), "h-10")}>Open report</Link></Panel> : null}
    <Disclosure title={<><FileJson2 aria-hidden className="size-4 text-muted-foreground"/>Import records manually<span className="ml-auto text-xs font-normal text-muted-foreground group-data-[open]/disclosure:hidden">AP2, ACP, or x402 JSON</span></>} className="rounded-2xl border border-border bg-card" triggerClassName="p-5" panelClassName="border-t border-border p-5"><p className="mb-4 text-sm text-muted-foreground">Use this when records do not come through your Razorpay connection or integration API.</p><IngestForm /></Disclosure>
  </div>;
}

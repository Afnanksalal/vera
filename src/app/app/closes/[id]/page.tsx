import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { PaymentInvestigation } from "@/components/payment-investigation";
import { Metric, PageHeader, Panel, StatusPill, formatDateTime, friendlyClaim, friendlyCode } from "@/components/console-ui";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { currentUser } from "@/server/http";
import { latestInvestigations } from "@/server/investigations";
import { closeById, latestClose } from "@/server/ledger";
import { aiSettingsPublic } from "@/server/settings";
import { Disclosure } from "@/components/ui/disclosure";

export const dynamic = "force-dynamic";

export default async function CloseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return null;
  const close = closeById(user.id, (await params).id);
  if (!close) notFound();
  const latest = latestClose(user.id);
  const isCurrent = latest?.summary.id === close.summary.id;
  const ai = aiSettingsPublic(user.id);
  const investigations = latestInvestigations(user.id, close.summary.id);
  const bundle = close.bundle as { head?: string; signed_digest?: string; artifacts?: unknown[]; events?: unknown[]; summary?: { challenges?: number; tool_calls?: number } } | null;
  const download = `/api/v1/closes/${close.summary.id}?download=bundle`;
  const payments = Array.from(close.claims.reduce((groups, claim) => {
    const current = groups.get(claim.sale_id) ?? [];
    current.push(claim);
    groups.set(claim.sale_id, current);
    return groups;
  }, new Map<string, typeof close.claims>())).sort((a, b) => b[1].filter((claim) => claim.status !== "PROVEN").length - a[1].filter((claim) => claim.status !== "PROVEN").length);

  return (
    <div className="grid gap-8">
      <Link href="/app/closes" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden className="size-4" />Back to reports</Link>
      <PageHeader
        title={`Report from ${formatDateTime(close.summary.created_at)}`}
        description={`${close.summary.sales} payments`}
        action={<a href={download} className={cn(buttonVariants({ variant: "outline" }), "h-10 gap-2")}><Download aria-hidden className="size-4" />Download evidence</a>}
      />
      <section aria-label="Report summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Payments checked" value={close.summary.sales} />
        <Metric label="Checks passed" value={close.summary.proven} tone="good" />
        <Metric label="Needs attention" value={close.summary.excepted} tone="bad" />
        <Metric label="Inconclusive" value={close.summary.abstained} />
      </section>
      <Panel className="flex flex-col gap-4 border-ok/20 bg-ok/[0.02] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ok" />
          <p className="font-medium">Evidence verified independently</p>
        </div>
        <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">{investigations.size} of {payments.length} payments investigated by AI</span>
      </Panel>
      <Panel>
        <h2 className="font-semibold">Payment results</h2>
        <div className="mt-5 grid gap-4">
          {payments.map(([saleId, claims]) => {
            const issues = claims.filter((claim) => claim.status !== "PROVEN");
            const passed = claims.length - issues.length;
            return (
              <div key={saleId} className="rounded-xl border border-border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="truncate font-mono text-xs font-medium">{saleId}</p><p className="mt-1 text-sm text-muted-foreground">{passed} of {claims.length} checks passed</p></div>
                  {issues.length ? <span className="w-fit rounded-full bg-bad/10 px-2.5 py-1 text-xs font-medium text-bad">{issues.length} {issues.length === 1 ? "issue" : "issues"}</span> : <span className="w-fit rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok">All checks passed</span>}
                </div>
                {issues.length ? <div className="mt-4 grid gap-2">{issues.map((claim) => <div key={claim.claim_id} className="rounded-lg bg-bad/[0.035] p-3"><p className="text-sm font-medium">{friendlyClaim(claim.type)}</p><p className="mt-0.5 text-sm text-bad">{friendlyCode(claim.code)}</p></div>)}</div> : null}
                <PaymentInvestigation saleId={saleId} closeId={close.summary.id} configured={ai.configured} model={ai.model} initial={investigations.get(saleId) ?? null} canRun={isCurrent} />
                <Disclosure title={`View all ${claims.length} checks`} className="mt-4 border-t border-border pt-3" triggerClassName="text-muted-foreground"><div className="grid gap-2">{claims.map((claim) => <div key={claim.claim_id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"><span className="text-sm">{friendlyClaim(claim.type)}</span><StatusPill status={claim.status} /></div>)}</div></Disclosure>
              </div>
            );
          })}
        </div>
      </Panel>
      <Disclosure title="Technical evidence details" className="rounded-2xl border border-border bg-card" triggerClassName="p-5" panelClassName="grid gap-4 border-t border-border p-5 text-sm">
          <div><p className="text-muted-foreground">Report ID</p><p className="mt-1 break-all font-mono text-xs">{close.summary.id}</p></div>
          <div><p className="text-muted-foreground">Evidence fingerprint</p><p className="mt-1 break-all font-mono text-xs">{close.summary.world_hash}</p></div>
          <div><p className="text-muted-foreground">Signed chain head</p><p className="mt-1 break-all font-mono text-xs">{bundle?.head ?? "—"}</p></div>
          <div><p className="text-muted-foreground">Signed report digest</p><p className="mt-1 break-all font-mono text-xs">{bundle?.signed_digest ?? bundle?.head ?? "—"}</p></div>
          <div className="flex flex-wrap gap-8"><div><p className="text-muted-foreground">Source files embedded</p><p className="mt-1 font-medium">{bundle?.artifacts?.length ?? 0}</p></div><div><p className="text-muted-foreground">Events</p><p className="mt-1 font-medium">{bundle?.events?.length ?? 0}</p></div><div><p className="text-muted-foreground">Automated lookups</p><p className="mt-1 font-medium">{bundle?.summary?.tool_calls ?? 0}</p></div><div><p className="text-muted-foreground">Verification challenges</p><p className="mt-1 font-medium">{bundle?.summary?.challenges ?? 0}</p></div></div>
      </Disclosure>
    </div>
  );
}

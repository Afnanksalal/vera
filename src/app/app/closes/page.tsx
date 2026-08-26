import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { BundleVerifier } from "@/components/bundle-verifier";
import { EmptyState, PageHeader, formatDateTime } from "@/components/console-ui";
import { currentUser } from "@/server/http";
import { listCloses } from "@/server/ledger";
import { Disclosure } from "@/components/ui/disclosure";

export const dynamic = "force-dynamic";

export default async function ClosesPage() {
  const user = await currentUser(); if (!user) return null;
  const closes = listCloses(user.id);
  return <div className="grid gap-8">
    <PageHeader title="Reports" description="Open a completed check, review its outcome, or download the signed evidence for an auditor." />
    {closes.length === 0 ? <EmptyState icon={FileCheck2} title="No reports yet" description="Import payment records from the Overview, then run the checks to create your first report." /> : <div className="grid gap-3">{closes.map((close) => {
      const attention = close.excepted + close.abstained;
      return <Link key={close.id} href={`/app/closes/${close.id}`} className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand/35"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{formatDateTime(close.created_at)}</p><p className="mt-1 text-sm text-muted-foreground">{close.sales} payments checked</p></div><div className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded-full bg-ok/10 px-2.5 py-1 text-ok">{close.proven} passed</span>{attention ? <span className="rounded-full bg-bad/10 px-2.5 py-1 text-bad">{attention} need attention</span> : <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">No issues</span>}<span className="ml-1 font-medium text-brand group-hover:underline">Open report</span></div></div></Link>;
    })}</div>}
    <Disclosure title="Advanced: verify an exported report" className="rounded-2xl border border-border bg-card" triggerClassName="p-5" panelClassName="grid gap-4 border-t border-border p-5"><p className="text-sm text-muted-foreground">Use this when someone sends you a Vera evidence bundle and you want to confirm its signature and contents.</p><BundleVerifier/><a className="w-fit text-sm font-medium text-brand hover:underline" href="/api/v1/public-key">Download installation public key</a></Disclosure>
  </div>;
}

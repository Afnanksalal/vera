import { CheckCircle2 } from "lucide-react";
import { AckButton } from "@/components/ack-button";
import { EmptyState, PageHeader, Panel, friendlyClaim, friendlyCode } from "@/components/console-ui";
import { listReviews } from "@/server/ledger";
import { currentUser } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await currentUser(); if (!user) return null;
  const open = listReviews(user.id, "open");
  return <div className="grid gap-8"><PageHeader title="Issues" description="Resolve missing or conflicting payment evidence. Add a note when you have checked an issue; corrected source data can be imported and checked again." />{open.length === 0 ? <EmptyState icon={CheckCircle2} title="Nothing needs your attention" description="There are no open issues from your latest checks." /> : <div className="grid gap-3">{open.map((row) => <Panel key={row.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{friendlyClaim(row.claim_type)}</p><p className="mt-1 text-sm text-bad">{friendlyCode(row.code)}</p><p className="mt-2 font-mono text-xs text-muted-foreground">Payment {row.sale_id}</p></div><AckButton id={row.id}/></Panel>)}</div>}</div>;
}

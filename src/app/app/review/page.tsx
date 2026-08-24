import { CheckCircle2 } from "lucide-react";
import { AckButton } from "@/components/ack-button";
import { EmptyState, PageHeader, Panel, friendlyClaim, friendlyCode } from "@/components/console-ui";
import { PaymentInvestigation } from "@/components/payment-investigation";
import { currentUser } from "@/server/http";
import { latestInvestigations } from "@/server/investigations";
import { latestClose, listReviews, type ReviewRow } from "@/server/ledger";
import { aiSettingsPublic } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await currentUser();
  if (!user) return null;
  const open = listReviews(user.id, "open");
  const close = latestClose(user.id);
  const ai = aiSettingsPublic(user.id);
  const investigations = close ? latestInvestigations(user.id, close.summary.id) : new Map();
  const payments = open.reduce((groups, issue) => {
    const current = groups.get(issue.sale_id) ?? [];
    current.push(issue);
    groups.set(issue.sale_id, current);
    return groups;
  }, new Map<string, ReviewRow[]>());

  return (
    <div className="grid gap-8">
      <PageHeader title="Issues" description="Vera identifies the evidence problem first. Run an AI investigation on any payment for an explanation that is checked against the same evidence before you act." />
      {open.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing needs your attention" description="There are no open issues from your latest checks." />
      ) : (
        <div className="grid gap-4">
          {[...payments.entries()].map(([saleId, issues]) => (
            <Panel key={saleId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">Payment investigation</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{saleId}</p>
                </div>
                <span className="rounded-full bg-bad/10 px-2.5 py-1 text-xs font-medium text-bad">{issues.length} {issues.length === 1 ? "issue" : "issues"}</span>
              </div>
              <div className="mt-4 grid gap-2">
                {issues.map((issue) => (
                  <div key={issue.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{friendlyClaim(issue.claim_type)}</p>
                      <p className="mt-0.5 text-sm text-bad">{friendlyCode(issue.code)}</p>
                    </div>
                    <AckButton id={issue.id} />
                  </div>
                ))}
              </div>
              {close ? <PaymentInvestigation saleId={saleId} closeId={close.summary.id} configured={ai.configured} model={ai.model} initial={investigations.get(saleId) ?? null} /> : null}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

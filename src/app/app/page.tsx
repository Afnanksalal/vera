import { CloseButton } from "@/components/app-actions";
import { IngestForm } from "@/components/ingest-form";
import { latestClose, listReviews, recordsForUser } from "@/server/ledger";
import { currentUser } from "@/server/http";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const user = await currentUser();
  if (!user) return null;
  const events = recordsForUser(user.id).length;
  const close = latestClose(user.id);
  const open = listReviews(user.id, "open");

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <CloseButton />
      </div>
      <section className="grid gap-2 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium">Import AP2, ACP, or x402 records</h2>
        <IngestForm />
      </section>
      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Ingested events" value={String(events)} />
        <Stat label="Proven" value={String(close?.summary.proven ?? 0)} tone="ok" />
        <Stat label="Excepted" value={String(close?.summary.excepted ?? 0)} tone="bad" />
        <Stat label="Open reviews" value={String(open.length)} />
      </section>
      {!close ? (
        <p className="text-sm text-muted-foreground">
          Import real payment and mandate records, then run a close. The verifier is the only claim mutator.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Claim</th>
                <th className="px-4 py-2 font-medium">Sale</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Code</th>
              </tr>
            </thead>
            <tbody>
              {close.claims.map((claim) => (
                <tr key={claim.claim_id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{claim.type}</td>
                  <td className="px-4 py-2 font-mono text-xs">{claim.sale_id}</td>
                  <td
                    className={cn(
                      "px-4 py-2",
                      claim.status === "PROVEN" && "text-[color:var(--ok)]",
                      (claim.status === "EXCEPTED" || claim.status === "ABSTAINED") && "text-[color:var(--bad)]"
                    )}
                  >
                    {claim.status}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{claim.code ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "ok" && "text-[color:var(--ok)]",
          tone === "bad" && "text-[color:var(--bad)]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

import { AckButton } from "@/components/ack-button";
import { listReviews } from "@/server/ledger";
import { requireUser } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await requireUser();
  const open = listReviews(user.id, "open");

  return (
    <div className="grid gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Humans acknowledge exceptions. They cannot override the verifier. To change a claim, ingest a corrected
        record and close again.
      </p>
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open reviews.</p>
      ) : (
        <ul className="grid gap-3">
          {open.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
              <div>
                <p className="font-mono text-sm">
                  {row.sale_id} · {row.claim_type}
                </p>
                <p className="text-sm text-muted-foreground">{row.code ?? "ABSTAINED"}</p>
              </div>
              <AckButton id={row.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

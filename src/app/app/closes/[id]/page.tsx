import { notFound } from "next/navigation";
import { closeById } from "@/server/ledger";
import { currentUser } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function CloseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return null;
  const close = closeById(user.id, (await params).id);
  if (!close) notFound();
  const bundle = close.bundle as { head?: string; events?: unknown[]; summary?: { challenges?: number; tool_calls?: number } } | null;
  return <div className="grid gap-6"><div><h2 className="text-lg font-semibold">Close {close.summary.id}</h2><p className="mt-1 font-mono text-xs text-muted-foreground">world {close.summary.world_hash}</p></div><section className="grid gap-3 sm:grid-cols-4">{[["Sales",close.summary.sales],["Proven",close.summary.proven],["Excepted",close.summary.excepted],["Abstained",close.summary.abstained]].map(([label,value])=><div key={label} className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</section><section className="rounded-xl border border-border p-5"><h3 className="font-semibold">Audit identity</h3><dl className="mt-3 grid gap-2 text-sm"><div><dt className="text-muted-foreground">Chain head</dt><dd className="break-all font-mono text-xs">{bundle?.head ?? "—"}</dd></div><div className="flex gap-6"><div><dt className="text-muted-foreground">Events</dt><dd>{bundle?.events?.length ?? 0}</dd></div><div><dt className="text-muted-foreground">Tool calls</dt><dd>{bundle?.summary?.tool_calls ?? 0}</dd></div><div><dt className="text-muted-foreground">Challenges</dt><dd>{bundle?.summary?.challenges ?? 0}</dd></div></div></dl><a className="mt-4 inline-block text-sm text-brand underline underline-offset-4" href={`/api/v1/closes/${close.summary.id}?download=bundle`}>Download complete evidence bundle</a></section><section className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="text-muted-foreground"><th className="px-4 py-2">Sale</th><th>Claim</th><th>Status</th><th>Code</th><th>Verifier</th></tr></thead><tbody>{close.claims.map((claim)=><tr key={claim.claim_id} className="border-t border-border"><td className="px-4 py-2 font-mono text-xs">{claim.sale_id}</td><td className="font-mono text-xs">{claim.type}</td><td>{claim.status}</td><td className="font-mono text-xs">{claim.code ?? "—"}</td><td>{claim.accepted_by ?? claim.reject_reason ?? "—"}</td></tr>)}</tbody></table></section></div>;
}

import Link from "next/link";
import { BundleVerifier } from "@/components/bundle-verifier";
import { requireUser } from "@/server/http";
import { listCloses } from "@/server/ledger";

export const dynamic = "force-dynamic";

export default async function ClosesPage() {
  const user = await requireUser();
  const closes = listCloses(user.id);
  return <div className="grid gap-8">
    <section className="grid gap-3"><div><h2 className="text-lg font-semibold">Audit bundles</h2><p className="mt-1 text-sm text-muted-foreground">Download a self-contained close or verify a bundle against this installation’s trusted signing identity.</p></div><BundleVerifier/><a className="text-sm text-brand underline underline-offset-4" href="/api/v1/public-key">Download installation public key</a></section>
    <section className="grid gap-3"><h2 className="text-lg font-semibold">Close history</h2>{closes.length === 0 ? <p className="text-sm text-muted-foreground">No closes yet.</p> : <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="text-muted-foreground"><th className="px-4 py-2">Created</th><th>Sales</th><th>Proven</th><th>Excepted</th><th>Abstained</th><th></th></tr></thead><tbody>{closes.map((close) => <tr key={close.id} className="border-t border-border"><td className="px-4 py-3"><Link className="text-brand underline underline-offset-4" href={`/app/closes/${close.id}`}>{new Date(close.created_at).toLocaleString()}</Link></td><td>{close.sales}</td><td>{close.proven}</td><td>{close.excepted}</td><td>{close.abstained}</td><td><a className="text-brand underline underline-offset-4" href={`/api/v1/closes/${close.id}?download=bundle`}>Download</a></td></tr>)}</tbody></table></div>}</section>
  </div>;
}

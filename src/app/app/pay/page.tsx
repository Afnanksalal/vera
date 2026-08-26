import Link from "next/link";
import { CreditCard } from "lucide-react";
import { CheckoutForm } from "@/components/checkout-form";
import { EmptyState, PageHeader, Panel, formatDateTime } from "@/components/console-ui";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { currentUser } from "@/server/http";
import { listVerifiedPurchases } from "@/server/purchases";
import { razorpayPublic } from "@/server/razorpay";
import { Disclosure } from "@/components/ui/disclosure";

export const dynamic = "force-dynamic";

export default async function PayPage() {
  const user = await currentUser();
  if (!user) return null;
  const rzp = razorpayPublic(user.id);
  const recent = listVerifiedPurchases(user.id, 8);
  return <div className="grid gap-8">
    <PageHeader title="Purchase" />
    {!rzp.configured || !rzp.mode ? <EmptyState icon={CreditCard} title="Razorpay not connected" action={<Link href="/app/settings#razorpay" className={cn(buttonVariants(), "h-10")}>Connect Razorpay</Link>} /> : <Panel>
      <div className="mb-6"><p className="font-medium">{rzp.mode === "live" ? "Live purchase" : "Test purchase"}</p>{rzp.mode === "live" ? <p className="mt-1 text-sm text-bad">Real payment</p> : null}</div>
      <CheckoutForm mode={rzp.mode} />
      <Disclosure title="Pending evidence" className="mt-6 border-t border-border pt-4"><p className="text-sm text-muted-foreground">Settlement and bank credit</p></Disclosure>
    </Panel>}
    {recent.length ? <Panel><h2 className="mb-5 font-semibold">Recent purchases</h2><div className="grid gap-3">{recent.map((purchase) => <article key={purchase.id} className="grid min-w-0 gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-medium">{purchase.id}</p><span className={purchase.state === "paid" ? "rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok" : purchase.state === "failed" ? "rounded-full bg-bad/10 px-2 py-0.5 text-xs text-bad" : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"}>{purchase.state}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(purchase.created_at)} · {purchase.mode}</p><Disclosure title="Evidence fingerprints" className="mt-2 text-xs" triggerClassName="text-muted-foreground"><dl className="grid gap-1 font-mono"><div><dt className="text-muted-foreground">Intent</dt><dd className="break-all">{purchase.intent_hash}</dd></div><div><dt className="text-muted-foreground">Cart</dt><dd className="break-all">{purchase.cart_hash}</dd></div></dl></Disclosure></div>{purchase.payment_id ? <p className="break-all font-mono text-xs">{purchase.payment_id}</p> : <p className="text-xs text-muted-foreground">Awaiting capture</p>}</article>)}</div></Panel> : null}
  </div>;
}

import Link from "next/link";
import { CreditCard } from "lucide-react";
import { CheckoutForm } from "@/components/checkout-form";
import { EmptyState, PageHeader, Panel, formatDateTime } from "@/components/console-ui";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { currentUser } from "@/server/http";
import { listVerifiedPurchases } from "@/server/purchases";
import { razorpayPublic } from "@/server/razorpay";

export const dynamic = "force-dynamic";

export default async function PayPage() {
  const user = await currentUser();
  if (!user) return null;
  const rzp = razorpayPublic(user.id);
  const recent = listVerifiedPurchases(user.id, 8);
  return <div className="grid gap-8">
    <PageHeader title="Verified purchase" description="Sign the mandate and exact cart before payment, then bind the captured Razorpay payment to that evidence." />
    {!rzp.configured || !rzp.mode ? <EmptyState icon={CreditCard} title="Connect Razorpay first" description="Add your Razorpay test credentials before creating a verified purchase." action={<Link href="/app/settings#razorpay" className={cn(buttonVariants(), "h-10")}>Connect Razorpay</Link>} /> : <Panel>
      <div className="mb-6"><p className="font-medium">{rzp.mode === "live" ? "Live verified purchase" : "Test-mode verified purchase"}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{rzp.mode === "live" ? "This creates real signed evidence and can charge real money. Settlement and bank evidence arrive later." : "No real money is charged. The mandate, cart, merchant receipt, and payment binding are still cryptographically real."}</p></div>
      <CheckoutForm mode={rzp.mode} />
      <details className="mt-6 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">What remains after capture?</summary><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Processor settlement and bank-credit proof only exist after a live payout. Import those on the Evidence page when they arrive; Vera will never manufacture them in test mode.</p></details>
    </Panel>}
    {recent.length ? <Panel><div className="mb-5"><h2 className="font-semibold">Recent purchase sessions</h2><p className="mt-1 text-sm text-muted-foreground">The hashes below were committed before their Razorpay orders were created.</p></div><div className="grid gap-3">{recent.map((purchase) => <article key={purchase.id} className="grid min-w-0 gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-medium">{purchase.id}</p><span className={purchase.state === "paid" ? "rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok" : purchase.state === "failed" ? "rounded-full bg-bad/10 px-2 py-0.5 text-xs text-bad" : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"}>{purchase.state}</span></div><p className="mt-1 text-xs text-muted-foreground">Created {formatDateTime(purchase.created_at)} · {purchase.mode}</p><details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Evidence fingerprints</summary><dl className="mt-2 grid gap-1 font-mono"><div><dt className="text-muted-foreground">Intent</dt><dd className="break-all">{purchase.intent_hash}</dd></div><div><dt className="text-muted-foreground">Cart</dt><dd className="break-all">{purchase.cart_hash}</dd></div></dl></details></div>{purchase.payment_id ? <p className="break-all font-mono text-xs">{purchase.payment_id}</p> : <p className="text-xs text-muted-foreground">Awaiting capture</p>}</article>)}</div></Panel> : null}
  </div>;
}

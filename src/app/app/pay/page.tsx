import Link from "next/link";
import { CreditCard } from "lucide-react";
import { CheckoutForm } from "@/components/checkout-form";
import { EmptyState, PageHeader, Panel } from "@/components/console-ui";
import { currentUser } from "@/server/http";
import { razorpayPublic } from "@/server/razorpay";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PayPage() {
  const user = await currentUser(); if (!user) return null;
  const rzp = razorpayPublic(user.id);
  return <div className="grid gap-8"><PageHeader title="Test a payment" description="Run a Razorpay checkout and confirm that Vera captures, verifies, and checks the payment correctly." />{!rzp.configured || !rzp.mode ? <EmptyState icon={CreditCard} title="Connect Razorpay first" description="Add your Razorpay test credentials before running a test payment." action={<Link href="/app/settings#razorpay" className={cn(buttonVariants(), "h-10")}>Connect Razorpay</Link>} /> : <Panel><div className="mb-6"><p className="font-medium">{rzp.mode === "live" ? "Live payment" : "Test payment"}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{rzp.mode === "live" ? "This can charge real money. Confirm the amount and checkout details carefully." : "No real money is charged in Razorpay test mode."}</p></div><CheckoutForm mode={rzp.mode}/><details className="mt-6 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">What Vera checks</summary><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Vera verifies the Razorpay order, checkout signature, fetched payment, ingestion, and resulting report. Mandate evidence must still come from your integration; Vera will never invent it.</p></details></Panel>}</div>;
}

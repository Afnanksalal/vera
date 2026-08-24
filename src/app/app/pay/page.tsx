import { CheckoutForm } from "@/components/checkout-form";
import { currentUser } from "@/server/http";
import { razorpayPublic } from "@/server/razorpay";

export const dynamic = "force-dynamic";

export default async function PayPage() {
  const user = await currentUser();
  if (!user) return null;
  const rzp = razorpayPublic(user.id);
  return (
    <div className="grid gap-4">
      <p className="max-w-xl text-sm text-muted-foreground">
        {rzp.mode === "live"
          ? "Live Checkout is enabled for this installation. This creates a real Razorpay order and can charge real money after confirmation."
          : "Test Checkout verifies the complete order, signature, payment-fetch, ingestion, and close path using Razorpay test mode."}
        {" "}A checkout created here has no mandate attestation unless your Razorpay integration supplies one, so Vera records that evidence as missing rather than manufacturing it.
      </p>
      {rzp.configured && rzp.mode ? <CheckoutForm mode={rzp.mode} /> : <p className="text-sm">Connect Razorpay in Settings first.</p>}
    </div>
  );
}

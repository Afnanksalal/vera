"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void };
  }
}

export function CheckoutForm({ mode }: { mode: "test" | "live" }) {
  const [amount, setAmount] = useState(mode === "live" ? "100" : "10000");
  const [status, setStatus] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const [pending, setPending] = useState(false);

  async function pay() {
    setPending(true);
    setStatus("Creating order…");
    const orderRes = await fetch("/api/v1/razorpay/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount_paise: Number(amount) }),
    });
    const order = (await orderRes.json()) as { id?: string; amount?: number; key_id?: string; error?: string };
    if (!orderRes.ok || !order.id || !order.key_id) {
      setStatus(order.error || "Could not create order");
      setPending(false);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      if (window.Razorpay) return resolve();
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Checkout.js"));
      document.body.appendChild(script);
    });
    await new Promise<void>((resolve, reject) => {
      const ck = new window.Razorpay!({
        key: order.key_id,
        amount: order.amount,
        currency: "INR",
        name: "Vera integration verification",
        order_id: order.id,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const done = await fetch("/api/v1/razorpay/checkout", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...response, close: true }),
          });
          const data = (await done.json()) as { error?: string };
          if (!done.ok) {
            reject(new Error(data.error || "Verify failed"));
            return;
          }
          setStatus("Payment captured, ingested, and closed.");
          resolve();
        },
        modal: { ondismiss: () => reject(new Error("Checkout was dismissed before payment.")) },
      });
      ck.on("payment.failed", (response) => reject(new Error(response.error?.description || "Razorpay reported a failed payment.")));
      ck.open();
    });
    setPending(false);
  }

  return (
    <form
      className="grid max-w-sm gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        pay().catch((err) => { setPending(false); setStatus(err instanceof Error ? err.message : "Payment failed"); });
      }}
    >
      <Field label="Amount (paise)">
        <Input type="number" min={100} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {mode === "live" ? <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmLive} onChange={(event) => setConfirmLive(event.target.checked)} /><span>I understand this opens live Razorpay Checkout and may charge real money.</span></label> : null}
      <Button type="submit" disabled={pending || (mode === "live" && !confirmLive)} className="h-10 w-fit px-4">
        {pending ? "Processing…" : `Open ${mode === "live" ? "live" : "test"} Razorpay Checkout`}
      </Button>
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
    </form>
  );
}

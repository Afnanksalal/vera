"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void };
  }
}

type FormState = { principalDid: string; agentDid: string; merchantId: string; category: string; sku: string; quantity: string; unitAmount: string; budget: string; validityMinutes: string };
const INITIAL: FormState = { principalDid: "did:web:principal.local", agentDid: "did:web:agent.local", merchantId: "merchant:vera", category: "software", sku: "VERA-TEST-PURCHASE", quantity: "1", unitAmount: "100.00", budget: "500.00", validityMinutes: "60" };

export function CheckoutForm({ mode }: { mode: "test" | "live" }) {
  const [form, setForm] = useState(INITIAL);
  const [status, setStatus] = useState<string | null>(null);
  const [proof, setProof] = useState<{ intentHash: string; cartHash: string } | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function loadCheckout() {
    if (window.Razorpay) return;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay Checkout."));
      document.body.appendChild(script);
    });
  }

  async function pay() {
    setPending(true);
    setProof(null);
    setStatus("Signing the mandate and cart before payment…");
    const purchaseRes = await fetch("/api/v1/purchases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ principal_did: form.principalDid, agent_did: form.agentDid, merchant_id: form.merchantId, category: form.category, sku: form.sku, quantity: Number(form.quantity), unit_paise: Math.round(Number(form.unitAmount) * 100), budget_paise: Math.round(Number(form.budget) * 100), validity_minutes: Number(form.validityMinutes) }),
    });
    const created = (await purchaseRes.json()) as { purchase?: { intent_hash: string; cart_hash: string }; order?: { id: string; amount: number; key_id: string }; error?: string };
    if (!purchaseRes.ok || !created.order?.id || !created.order.key_id || !created.purchase) throw new Error(created.error || "Could not create the verified purchase.");
    setProof({ intentHash: created.purchase.intent_hash, cartHash: created.purchase.cart_hash });
    setStatus("Signed evidence stored. Opening Razorpay…");
    await loadCheckout();
    await new Promise<void>((resolve, reject) => {
      const checkout = new window.Razorpay!({
        key: created.order!.key_id, amount: created.order!.amount, currency: "INR", name: "Vera verified purchase", description: `${form.quantity} × ${form.sku}`, order_id: created.order!.id,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          setStatus("Verifying capture and binding the signed evidence…");
          const done = await fetch("/api/v1/razorpay/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...response, close: true }) });
          const data = (await done.json()) as { error?: string };
          if (!done.ok) return reject(new Error(data.error || "Payment verification failed."));
          setStatus("Payment captured. Mandate, cart, receipt, and Razorpay capture are verified in the signed report.");
          resolve();
        },
        modal: { ondismiss: () => reject(new Error("Checkout was dismissed before payment.")) },
      });
      checkout.on("payment.failed", (response) => reject(new Error(response.error?.description || "Razorpay reported a failed payment.")));
      checkout.open();
    });
  }

  return <form className="grid gap-6" onSubmit={(event) => { event.preventDefault(); pay().catch((error) => setStatus(error instanceof Error ? error.message : "Payment failed.")).finally(() => setPending(false)); }}>
    <section className="grid gap-4">
      <div><h3 className="font-semibold">Who is authorizing the agent?</h3><p className="mt-1 text-sm text-muted-foreground">Vera creates a real Ed25519 attestation before checkout. Use stable identifiers from your principal and agent integration.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Principal DID"><Input required value={form.principalDid} onChange={set("principalDid")} /></Field>
        <Field label="Agent DID"><Input required value={form.agentDid} onChange={set("agentDid")} /></Field>
        <Field label="Allowed category"><Input required value={form.category} onChange={set("category")} /></Field>
        <Field label="Mandate budget (₹)"><Input required type="number" min="1" step="0.01" value={form.budget} onChange={set("budget")} /></Field>
        <Field label="Mandate validity (minutes)"><Input required type="number" min="5" max="10080" value={form.validityMinutes} onChange={set("validityMinutes")} /></Field>
      </div>
    </section>
    <section className="grid gap-4 border-t border-border pt-6">
      <div><h3 className="font-semibold">What is the merchant signing?</h3><p className="mt-1 text-sm text-muted-foreground">The exact line item and total are hashed and merchant-signed before Razorpay receives the order.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Merchant ID"><Input required value={form.merchantId} onChange={set("merchantId")} /></Field>
        <Field label="SKU"><Input required value={form.sku} onChange={set("sku")} /></Field>
        <Field label="Quantity"><Input required type="number" min="1" step="1" value={form.quantity} onChange={set("quantity")} /></Field>
        <Field label="Unit amount (₹)"><Input required type="number" min="1" step="0.01" value={form.unitAmount} onChange={set("unitAmount")} /></Field>
      </div>
    </section>
    {mode === "live" ? <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmLive} onChange={(event) => setConfirmLive(event.target.checked)} /><span>I understand this opens live Razorpay Checkout and may charge real money.</span></label> : null}
    <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={pending || (mode === "live" && !confirmLive)} className="h-10 w-fit px-4">{pending ? "Preparing proof…" : `Create verified ${mode === "live" ? "live " : ""}purchase`}</Button><p className="text-xs text-muted-foreground">Cart total: ₹{(Number(form.quantity || 0) * Number(form.unitAmount || 0)).toFixed(2)}</p></div>
    {status ? <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm">{status}</p> : null}
    {proof ? <details className="rounded-xl border border-border p-4 text-xs"><summary className="cursor-pointer font-medium">Pre-payment evidence fingerprints</summary><dl className="mt-3 grid gap-2 font-mono"><div><dt className="text-muted-foreground">Intent</dt><dd className="break-all">{proof.intentHash}</dd></div><div><dt className="text-muted-foreground">Cart</dt><dd className="break-all">{proof.cartHash}</dd></div></dl></details> : null}
  </form>;
}

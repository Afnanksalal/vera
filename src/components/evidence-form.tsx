"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Notice } from "@/components/ui/notice";

type PaymentOption = { id: string; amount_paise: number; intent_id: string | null; settlement_net: number | null; settlement_utr: string | null };

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the evidence file."));
    reader.readAsDataURL(file);
  });
}

export function EvidenceForm({ payments, kind }: { payments: PaymentOption[]; kind: "processor" | "bank_statement" }) {
  const first = payments[0];
  const [paymentId, setPaymentId] = useState(first?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState<Record<string, string>>({
    settlement_id: "", gross: first ? (first.amount_paise / 100).toFixed(2) : "", fee: "0.00", tax: "0.00", net: first ? (first.amount_paise / 100).toFixed(2) : "", psp_ref: "", settled_on: "",
    bank_id: "", amount: first?.settlement_net != null ? (first.settlement_net / 100).toFixed(2) : "", date: "", narration: "", utr: first?.settlement_utr ?? "", intent_ref: first?.intent_id ?? "",
  });
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) => setFields((current) => ({ ...current, [key]: event.target.value }));

  function choosePayment(id: string) {
    setPaymentId(id);
    const payment = payments.find((row) => row.id === id);
    if (!payment) return;
    setFields((current) => ({ ...current, gross: (payment.amount_paise / 100).toFixed(2), net: (payment.amount_paise / 100).toFixed(2), amount: payment.settlement_net == null ? current.amount : (payment.settlement_net / 100).toFixed(2), utr: payment.settlement_utr ?? current.utr, intent_ref: payment.intent_id ?? "" }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setMessage("Choose the source report or bank statement first.");
    if (file.size > 1_000_000) return setMessage("Evidence files must be 1 MB or smaller.");
    setPending(true); setMessage("Hashing and importing evidence…");
    try {
      const common = { payment_id: paymentId, kind, file_name: file.name, mime_type: file.type || "application/octet-stream", file_base64: await toBase64(file) };
      const payload = kind === "processor" ? {
        ...common, settlement_id: fields.settlement_id, gross_minor: Math.round(Number(fields.gross) * 100), fee_minor: Math.round(Number(fields.fee) * 100), tax_minor: Math.round(Number(fields.tax) * 100), net_minor: Math.round(Number(fields.net) * 100), psp_ref: fields.psp_ref, settled_on: fields.settled_on,
      } : {
        ...common, bank_id: fields.bank_id, amount_minor: Math.round(Number(fields.amount) * 100), date: fields.date, narration: fields.narration, utr: fields.utr, intent_ref: fields.intent_ref || null,
      };
      const response = await fetch("/api/v1/evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Evidence import failed.");
      setMessage("Evidence added · report updated");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Evidence import failed."); }
    finally { setPending(false); }
  }

  return <form className="grid gap-4" onSubmit={submit}>
    <Field label="Payment"><Select value={paymentId} onValueChange={(value) => value && choosePayment(value)}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent>{payments.map((payment) => <SelectItem key={payment.id} value={payment.id}>{payment.id} · ₹{(payment.amount_paise / 100).toFixed(2)}</SelectItem>)}</SelectContent></Select></Field>
    {kind === "processor" ? <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Settlement ID"><Input required value={fields.settlement_id} onChange={set("settlement_id")} /></Field>
      <Field label="UTR / processor reference"><Input required value={fields.psp_ref} onChange={set("psp_ref")} /></Field>
      <Field label="Gross (₹)"><Input required type="number" min="0" step="0.01" value={fields.gross} onChange={set("gross")} /></Field>
      <Field label="Fee (₹)"><Input required type="number" min="0" step="0.01" value={fields.fee} onChange={set("fee")} /></Field>
      <Field label="Tax (₹)"><Input required type="number" min="0" step="0.01" value={fields.tax} onChange={set("tax")} /></Field>
      <Field label="Net credited (₹)"><Input required type="number" min="0" step="0.01" value={fields.net} onChange={set("net")} /></Field>
      <Field label="Settled on"><Input required inputMode="numeric" placeholder="YYYY-MM-DD" pattern="\d{4}-\d{2}-\d{2}" title="Use YYYY-MM-DD" value={fields.settled_on} onChange={set("settled_on")} /></Field>
    </div> : <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Bank transaction ID"><Input required value={fields.bank_id} onChange={set("bank_id")} /></Field>
      <Field label="UTR"><Input required value={fields.utr} onChange={set("utr")} /></Field>
      <Field label="Amount credited (₹)"><Input required type="number" min="0" step="0.01" value={fields.amount} onChange={set("amount")} /></Field>
      <Field label="Credit date"><Input required inputMode="numeric" placeholder="YYYY-MM-DD" pattern="\d{4}-\d{2}-\d{2}" title="Use YYYY-MM-DD" value={fields.date} onChange={set("date")} /></Field>
      <Field label="Bank narration"><Input required value={fields.narration} onChange={set("narration")} /></Field>
      <Field label="Mandate / intent reference"><Input value={fields.intent_ref} onChange={set("intent_ref")} /></Field>
    </div>}
    <Field label={kind === "processor" ? "Original processor report" : "Original bank statement"}><FileInput ref={fileRef} required accept=".csv,.json,.txt,.pdf,text/csv,application/json,application/pdf" /></Field>
    <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={pending || !payments.length}>{pending ? "Verifying…" : "Attach and recheck"}</Button>{message ? <Notice className="w-full">{message}</Notice> : null}</div>
  </form>;
}

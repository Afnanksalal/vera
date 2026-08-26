"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function base64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? ""); reader.onerror = () => reject(new Error("Could not read CSV.")); reader.readAsDataURL(file); }); }

export function BankCsvImport() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <div className="grid gap-3">
    <div className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground"><p className="font-medium text-foreground">Required CSV columns</p><p className="mt-1 font-mono">payment_id, bank_id, amount, date, narration, utr, intent_ref</p><p className="mt-2">Amount is in rupees. intent_ref is optional. Up to 200 rows and 1 MB are accepted; the original file is hashed and retained once.</p></div>
    <Input ref={input} type="file" required accept=".csv,text/csv" className="h-auto min-h-10 py-2" />
    <div className="flex flex-wrap items-center gap-3"><Button type="button" disabled={pending} onClick={async () => {
      const file = input.current?.files?.[0]; if (!file) return setMessage("Choose a CSV first."); if (file.size > 1_000_000) return setMessage("CSV must be 1 MB or smaller.");
      setPending(true); setMessage("Validating and matching bank rows…");
      try { const response = await fetch("/api/v1/evidence/bank-csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file_name: file.name, mime_type: file.type || "text/csv", file_base64: await base64(file) }) }); const body = await response.json() as { error?: string; result?: { rows: number; inserted: number; updated: number; unchanged: number } }; if (!response.ok) throw new Error(body.error || "Import failed."); const result = body.result!; setMessage(`${result.rows} rows checked: ${result.updated} payments updated, ${result.unchanged} unchanged.`); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Import failed."); } finally { setPending(false); }
    }}>{pending ? "Importing…" : "Import bank CSV"}</Button>{message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}</div>
  </div>;
}

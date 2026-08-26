"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Notice } from "@/components/ui/notice";

function base64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? ""); reader.onerror = () => reject(new Error("Could not read CSV.")); reader.readAsDataURL(file); }); }

export function BankCsvImport() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <div className="grid gap-3">
    <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground"><p className="font-medium text-foreground">CSV columns</p><p className="mt-1 font-mono">payment_id, bank_id, amount, date, narration, utr, intent_ref</p><p className="mt-2">Rupees · 200 rows · 1 MB</p></div>
    <FileInput ref={input} required accept=".csv,text/csv" />
    <div className="flex flex-wrap items-center gap-3"><Button type="button" disabled={pending} onClick={async () => {
      const file = input.current?.files?.[0]; if (!file) return setMessage("Choose a CSV first."); if (file.size > 1_000_000) return setMessage("CSV must be 1 MB or smaller.");
      setPending(true); setMessage("Validating and matching bank rows…");
      try { const response = await fetch("/api/v1/evidence/bank-csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file_name: file.name, mime_type: file.type || "text/csv", file_base64: await base64(file) }) }); const body = await response.json() as { error?: string; result?: { rows: number; inserted: number; updated: number; unchanged: number } }; if (!response.ok) throw new Error(body.error || "Import failed."); const result = body.result!; setMessage(`${result.rows} rows checked: ${result.updated} payments updated, ${result.unchanged} unchanged.`); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Import failed."); } finally { setPending(false); }
    }}>{pending ? "Importing…" : "Import bank CSV"}</Button>{message ? <Notice className="w-full">{message}</Notice> : null}</div>
  </div>;
}

"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Disclosure } from "@/components/ui/disclosure";

export function CalibrationForm({ rows }: { rows: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  return <Disclosure title="Advanced: confidence calibration" className="rounded-2xl border border-border bg-card" triggerClassName="p-5" panelClassName="border-t border-border p-5"><p className="text-sm text-muted-foreground">Import reviewed historical matches so Vera can estimate when an automatic match is safe. This is optional; without it Vera simply avoids showing a statistical confidence guarantee.</p><p className="mt-2 text-xs text-muted-foreground">Labelled examples currently stored: {rows}</p><div className="mt-4 flex min-w-0 flex-wrap items-center gap-3"><FileInput ref={input} accept="application/json,.json" className="max-w-xs"/><Button variant="outline" onClick={async () => { const file = input.current?.files?.[0]; if (!file) return setMessage("Choose a JSON file first."); try { const raw = JSON.parse(await file.text()); const importedRows = Array.isArray(raw) ? raw : raw.rows; const res = await fetch("/api/v1/calibration", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: importedRows, mode: "replace" }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Import failed"); setMessage(`Saved ${data.imported} reviewed examples. Reloading…`); location.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed"); } }}>Import reviewed examples</Button>{rows ? <Button variant="outline" onClick={async () => { const response = await fetch("/api/v1/calibration", { method: "DELETE" }); if (!response.ok) { const body = await response.json(); return setMessage(body.error || "Clear failed"); } location.reload(); }}>Clear examples</Button> : null}{message ? <p className="w-full text-sm text-muted-foreground">{message}</p> : null}</div><p className="mt-4 text-xs text-muted-foreground">Expected JSON: an array of objects with a numeric <code>score</code> and boolean <code>correct</code> field.</p></Disclosure>;
}

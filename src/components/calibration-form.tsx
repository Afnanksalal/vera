"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function CalibrationForm({ rows }: { rows: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  return <section className="rounded-xl border border-border p-5"><h2 className="font-semibold">Selective-risk calibration</h2><p className="mt-1 text-sm text-muted-foreground">Import historical match outcomes as JSON rows shaped <code>{`{"score": 0, "correct": true}`}</code>. Vera calibrates the acceptance threshold from real labelled outcomes; it never substitutes synthetic production data.</p><p className="mt-2 text-xs text-muted-foreground">Current labelled rows: {rows}</p><div className="mt-4 flex flex-wrap items-center gap-3"><input ref={input} type="file" accept="application/json,.json" className="max-w-xs text-sm"/><Button variant="outline" onClick={async () => {
    const file = input.current?.files?.[0]; if (!file) return setMessage("Choose a JSON calibration file.");
    try { const raw = JSON.parse(await file.text()); const rows = Array.isArray(raw) ? raw : raw.rows; const res = await fetch("/api/v1/calibration", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows, mode: "replace" }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Import failed"); setMessage(`Replaced calibration set with ${data.imported} labelled outcomes. Reloading…`); location.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed"); }
  }}>Replace calibration set</Button>{rows ? <Button variant="outline" onClick={async () => { const response = await fetch("/api/v1/calibration", { method: "DELETE" }); if (!response.ok) { const body = await response.json(); return setMessage(body.error || "Clear failed"); } location.reload(); }}>Clear</Button> : null}{message ? <p className="text-sm text-muted-foreground">{message}</p> : null}</div></section>;
}

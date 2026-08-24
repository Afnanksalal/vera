"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

type Analysis = {
  source: { sales: number; settlements: number; bank_credits: number };
  controls: { policy: string };
  risk: { calibration_rows: number; calibration: { threshold: number | null; alpha: number; delta: number; ub_error: number } | null; candidates: number; accepted: number; abstained: number };
  reconciliation: {
    source: string;
    matches: { credit_id: string; unit_ids: string[]; method: string }[];
    ambiguous_credit_ids: string[];
    unexplained_credit_ids: string[];
    in_transit_unit_ids: string[];
    search_truncated_credit_ids: string[];
  };
  anomalies: {
    deterministic: { rule: { id: string; name: string; description: string }; validation: { fires: string[] } }[];
    model: { rule: { name: string } | null; validation: { fires: string[]; reason: string } | null } | null;
  };
};

export function AnalysisConsole({ aiConfigured }: { aiConfigured: boolean }) {
  const [tolerance, setTolerance] = useState("100");
  const [windowDays, setWindowDays] = useState("2");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(ai: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ai, tolerance_paise: Number(tolerance), window_days: Number(windowDays) }) });
      const data = (await res.json()) as Analysis & { error?: string };
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed");
    } finally { setPending(false); }
  }

  return <div className="grid gap-6">
    <section className="rounded-xl border border-border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount tolerance (paise)"><Input type="number" min={0} max={10000} value={tolerance} onChange={(e) => setTolerance(e.target.value)} /></Field>
        <Field label="Settlement window (days)"><Input type="number" min={0} max={30} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} /></Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-3"><Button disabled={pending} onClick={() => run(false)}>{pending ? "Running…" : "Run verified analysis"}</Button><Button variant="outline" disabled={pending || !aiConfigured} onClick={() => run(true)}>Run with AI proposals</Button></div>
      {!aiConfigured ? <p className="mt-3 text-xs text-muted-foreground">Configure AI in Settings to enable model proposals. Deterministic verification remains available.</p> : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </section>
    {result ? <>
      <section className="grid gap-3 sm:grid-cols-4"><Stat label="Sales" value={result.source.sales}/><Stat label="Verified matches" value={result.reconciliation.matches.length}/><Stat label="Ambiguous" value={result.reconciliation.ambiguous_credit_ids.length}/><Stat label="Unexplained" value={result.reconciliation.unexplained_credit_ids.length}/></section>
      <section className="rounded-xl border border-border p-5"><h2 className="font-semibold">Selective risk control</h2>{result.risk.calibration ? <div className="mt-3 grid gap-3 sm:grid-cols-4"><Stat label="Calibration rows" value={result.risk.calibration_rows}/><Stat label="Accepted candidates" value={result.risk.accepted}/><Stat label="Risk abstentions" value={result.risk.abstained}/><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Simultaneous upper error bound</p><p className="mt-1 text-2xl font-semibold tabular-nums">{(result.risk.calibration.ub_error * 100).toFixed(1)}%</p><p className="mt-1 text-xs text-muted-foreground">{Math.round((1 - result.risk.calibration.delta) * 100)}% confidence</p></div></div> : <p className="mt-2 text-sm text-muted-foreground">No calibrated risk bound is shown until real labelled outcomes are imported.</p>}</section>
      <section className="rounded-xl border border-border p-5"><h2 className="font-semibold">Settlement reconciliation</h2><p className="mt-1 text-sm text-muted-foreground">{result.controls.policy}. Source: {result.reconciliation.source}.</p>{result.reconciliation.search_truncated_credit_ids.length ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Search budget reached for {result.reconciliation.search_truncated_credit_ids.length} credit(s); Vera abstained instead of claiming uniqueness.</p> : null}{result.reconciliation.matches.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead><tr className="text-muted-foreground"><th className="py-2">Bank credit</th><th>Settlement units</th><th>Method</th></tr></thead><tbody>{result.reconciliation.matches.map((match) => <tr key={match.credit_id} className="border-t border-border"><td className="py-2 font-mono text-xs">{match.credit_id}</td><td className="font-mono text-xs">{match.unit_ids.join(", ")}</td><td>{match.method}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-muted-foreground">No settlement assignments were verified.</p>}</section>
      <section className="rounded-xl border border-border p-5"><h2 className="font-semibold">Cross-sale anomalies</h2><div className="mt-3 grid gap-3">{result.anomalies.deterministic.length === 0 && !result.anomalies.model?.validation ? <p className="text-sm text-muted-foreground">No validated anomaly rule fired.</p> : null}{result.anomalies.deterministic.map((item) => <div key={item.rule.id} className="rounded-lg bg-muted p-3"><p className="text-sm font-medium">{item.rule.name}</p><p className="text-xs text-muted-foreground">{item.rule.description}</p><p className="mt-1 font-mono text-xs">{item.validation.fires.join(", ")}</p></div>)}{result.anomalies.model?.validation ? <div className="rounded-lg bg-muted p-3"><p className="text-sm font-medium">AI proposal: {result.anomalies.model.rule?.name}</p><p className="text-xs text-muted-foreground">{result.anomalies.model.validation.reason}</p><p className="mt-1 font-mono text-xs">{result.anomalies.model.validation.fires.join(", ")}</p></div> : null}</div></section>
    </> : null}
  </div>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>; }

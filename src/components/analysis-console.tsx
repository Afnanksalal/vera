"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Metric, Panel } from "@/components/console-ui";

type Analysis = {
  source: { sales: number; settlements: number; bank_credits: number };
  controls: { policy: string };
  risk: { calibration_rows: number; calibration: { threshold: number | null; alpha: number; delta: number; ub_error: number } | null; candidates: number; accepted: number; abstained: number };
  reconciliation: { source: string; matches: { credit_id: string; unit_ids: string[]; method: string }[]; ambiguous_credit_ids: string[]; unexplained_credit_ids: string[]; in_transit_unit_ids: string[]; search_truncated_credit_ids: string[] };
  anomalies: { deterministic: { rule: { id: string; name: string; description: string }; validation: { fires: string[] } }[]; model: { rule: { name: string } | null; validation: { fires: string[]; reason: string } | null } | null };
};

export function AnalysisConsole({ aiConfigured }: { aiConfigured: boolean }) {
  const [toleranceRupees, setToleranceRupees] = useState("1.00");
  const [windowDays, setWindowDays] = useState("2");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(ai: boolean) {
    setPending(true); setError(null);
    try {
      const res = await fetch("/api/v1/analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ai, tolerance_paise: Math.round(Number(toleranceRupees) * 100), window_days: Number(windowDays) }) });
      const data = (await res.json()) as Analysis & { error?: string };
      if (!res.ok) throw new Error(data.error || "Reconciliation failed");
      setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reconciliation failed"); }
    finally { setPending(false); }
  }

  const needsReview = result ? result.reconciliation.ambiguous_credit_ids.length + result.reconciliation.unexplained_credit_ids.length : 0;
  return <div className="grid gap-6">
    <Panel><div><h2 className="text-lg font-semibold">Match settlements to bank deposits</h2><p className="mt-1 text-sm text-muted-foreground">Adjust how much amount and date variation Vera may consider when looking for a match.</p></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Amount difference allowed (₹)"><Input type="number" min={0} max={100} step="0.01" value={toleranceRupees} onChange={(e) => setToleranceRupees(e.target.value)}/></Field><Field label="Date range (days)"><Input type="number" min={0} max={30} value={windowDays} onChange={(e) => setWindowDays(e.target.value)}/></Field></div><div className="mt-5 flex flex-wrap gap-3"><Button disabled={pending} onClick={() => run(false)}>{pending ? "Reconciling…" : "Reconcile payments"}</Button>{aiConfigured ? <Button variant="outline" disabled={pending} onClick={() => run(true)}>Include AI suggestions</Button> : null}</div>{!aiConfigured ? <p className="mt-3 text-xs text-muted-foreground">AI suggestions are optional and can be enabled in Settings.</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}</Panel>
    {result ? <><section aria-label="Reconciliation summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Payments" value={result.source.sales}/><Metric label="Verified matches" value={result.reconciliation.matches.length} tone="good"/><Metric label="Needs review" value={needsReview} tone={needsReview ? "bad" : "default"}/><Metric label="Still processing" value={result.reconciliation.in_transit_unit_ids.length}/></section>
      <Panel><h2 className="font-semibold">Matched deposits</h2><p className="mt-1 text-sm text-muted-foreground">Settlements Vera could match to a bank deposit without ambiguity.</p>{result.reconciliation.search_truncated_credit_ids.length ? <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800">Some deposits had too many possible combinations, so Vera left them for review instead of guessing.</p> : null}{result.reconciliation.matches.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-muted-foreground"><tr><th className="pb-3 font-medium">Bank deposit</th><th className="pb-3 font-medium">Matched settlements</th><th className="pb-3 font-medium">How it matched</th></tr></thead><tbody>{result.reconciliation.matches.map((match) => <tr key={match.credit_id} className="border-t border-border"><td className="py-3 pr-4 font-mono text-xs">{match.credit_id}</td><td className="py-3 pr-4 font-mono text-xs">{match.unit_ids.join(", ")}</td><td className="py-3">{match.method === "exact-unique" ? "Exact match" : match.method === "model-verified" ? "Verified AI suggestion" : "Verified group"}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-muted-foreground">No verified matches were found with these settings.</p>}</Panel>
      <Panel><h2 className="font-semibold">Unusual activity</h2><p className="mt-1 text-sm text-muted-foreground">Patterns across payments that may deserve a closer look.</p><div className="mt-4 grid gap-3">{result.anomalies.deterministic.length === 0 && !result.anomalies.model?.validation ? <p className="text-sm text-muted-foreground">No unusual patterns were found.</p> : null}{result.anomalies.deterministic.map((item) => <div key={item.rule.id} className="rounded-xl bg-muted/70 p-4"><p className="text-sm font-medium">{item.rule.name}</p><p className="mt-1 text-sm text-muted-foreground">{item.rule.description}</p><p className="mt-2 text-xs text-muted-foreground">Affects {item.validation.fires.length} payments</p></div>)}{result.anomalies.model?.validation ? <div className="rounded-xl bg-muted/70 p-4"><p className="text-sm font-medium">AI suggestion: {result.anomalies.model.rule?.name}</p><p className="mt-1 text-sm text-muted-foreground">{result.anomalies.model.validation.reason}</p><p className="mt-2 text-xs text-muted-foreground">Affects {result.anomalies.model.validation.fires.length} payments</p></div> : null}</div></Panel>
      <details className="rounded-2xl border border-border bg-card"><summary className="cursor-pointer p-5 text-sm font-medium">Advanced confidence details</summary><div className="border-t border-border p-5">{result.risk.calibration ? <div className="grid gap-3 sm:grid-cols-3"><Metric label="Labelled examples" value={result.risk.calibration_rows}/><Metric label="Automatically accepted" value={result.risk.accepted}/><Metric label="Estimated error ceiling" value={`${(result.risk.calibration.ub_error * 100).toFixed(1)}%`} detail={`${Math.round((1 - result.risk.calibration.delta) * 100)}% confidence`}/></div> : <p className="text-sm text-muted-foreground">No confidence estimate is available until real reviewed outcomes are imported below.</p>}<p className="mt-4 text-xs text-muted-foreground">Matching policy: {result.controls.policy}. Data source: {result.reconciliation.source}.</p></div></details>
    </> : null}
  </div>;
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { friendlyClaim, friendlyCode, friendlyStatus } from "@/components/console-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClaimResult = {
  type: string;
  ai_action: "prove" | "except" | "abstain";
  ai_code: string | null;
  rationale: string;
  verifier_accepted: boolean;
  verifier_reason: string;
  final_status: string;
  final_code: string | null;
};

type Result = {
  sale_id: string;
  model: string;
  tool_calls: number;
  claims: ClaimResult[];
};

export function AiInvestigator({
  sales,
  status,
}: {
  sales: { sale_id: string }[];
  status: { enabled: boolean; provider: string | null; name: string | null };
}) {
  const [saleId, setSaleId] = useState(sales[0]?.sale_id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sale_id: saleId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ask AI to investigate a payment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The model suggests what may have happened. Vera checks the suggestion against the stored evidence before showing a result.
          </p>
        </div>
        {status.enabled && (
          <p className="text-xs text-muted-foreground">
            {status.provider} {status.name}
          </p>
        )}
      </div>

      <div className="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <label className="text-sm text-muted-foreground sm:sr-only" htmlFor="sale">
          Payment to investigate
        </label>
        <Select value={saleId} onValueChange={(v) => typeof v === "string" && setSaleId(v)}>
          <SelectTrigger id="sale" className="h-9 min-w-0 sm:max-w-xs">
              <SelectValue placeholder="Choose a payment">
              {(value: string | null) => value ?? "Choose a payment"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sales.map((s) => (
              <SelectItem key={s.sale_id} value={s.sale_id} label={s.sale_id}>
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className="font-mono text-xs">{s.sale_id}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={run}
          disabled={loading || !status.enabled}
          className="h-9 w-full px-4 sm:w-auto"
        >
          {loading ? "Investigating…" : "Investigate payment"}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/8 p-3 text-sm text-[color:var(--bad)]">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-5">
          <p className="text-sm text-muted-foreground">
            Investigation complete for <span className="font-mono">{result.sale_id}</span>.
          </p>
          <div className="mt-3 space-y-2">
            {result.claims.map((c) => {
              const disagreed =
                (c.ai_action === "prove" && c.final_status === "EXCEPTED") ||
                (c.ai_action === "except" && c.final_status === "PROVEN") ||
                (!c.verifier_accepted && c.ai_action !== "abstain");
              return (
                <div key={c.type} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{friendlyClaim(c.type)}</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
                      <span>
                        AI suggestion: {c.ai_action}
                        {c.ai_code ? ` · ${friendlyCode(c.ai_code)}` : ""}
                      </span>
                      <span className={c.verifier_accepted ? "text-[color:var(--ok)]" : "text-[color:var(--bad)]"}>
                        Vera: {c.verifier_accepted ? "confirmed" : "rejected"}
                      </span>
                      <span>Result: {friendlyStatus(c.final_status)}</span>
                    </div>
                  </div>
                  {c.rationale && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.rationale}</p>}
                  {disagreed && (
                    <p className="mt-1 text-xs font-medium text-[color:var(--bad)]">
                      Vera rejected the AI suggestion because the evidence did not support it.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

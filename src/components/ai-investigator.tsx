"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  fault: string | null;
  provider: string | null;
  agent: string;
  tool_calls: number;
  claims: ClaimResult[];
};

export function AiInvestigator({
  sales,
  status,
}: {
  sales: { sale_id: string; fault: string }[];
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
        body: JSON.stringify({ sale_id: saleId, seed: 42 }),
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
          <h2 className="text-lg font-semibold">Investigate with AI</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The model reads the sale with tools and proposes a verdict. Vera&rsquo;s
            verifier then re-derives it, so a wrong call is caught, not booked.
          </p>
        </div>
        {status.enabled && (
          <p className="text-xs text-muted-foreground">
            {status.provider} {status.name}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="text-sm text-muted-foreground sm:sr-only" htmlFor="sale">
          Sale to investigate
        </label>
        <Select value={saleId} onValueChange={(v) => typeof v === "string" && setSaleId(v)}>
          <SelectTrigger id="sale" className="h-9 w-full sm:w-80">
            <SelectValue placeholder="Choose a sale" />
          </SelectTrigger>
          <SelectContent>
            {sales.map((s) => (
              <SelectItem key={s.sale_id} value={s.sale_id}>
                <span className="font-mono text-xs">{s.sale_id}</span>
                <span className="text-muted-foreground">planted {s.fault}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={run}
          disabled={loading || !status.enabled}
          className="h-9 w-full px-4 sm:w-auto"
        >
          {loading ? "Investigating…" : "Investigate"}
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
            {result.agent} made <span className="font-medium text-foreground">{result.tool_calls}</span> tool calls on{" "}
            <span className="font-mono">{result.sale_id}</span> (planted {result.fault}).
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
                    <span className="font-mono text-sm font-semibold">{c.type}</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
                      <span>
                        AI: {c.ai_action}
                        {c.ai_code ? ` ${c.ai_code}` : ""}
                      </span>
                      <span className={c.verifier_accepted ? "text-[color:var(--ok)]" : "text-[color:var(--bad)]"}>
                        verifier: {c.verifier_accepted ? "accepted" : "rejected"}
                      </span>
                      <span>→ {c.final_status}</span>
                    </div>
                  </div>
                  {c.rationale && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.rationale}</p>}
                  {disagreed && (
                    <p className="mt-1 text-xs font-medium text-[color:var(--bad)]">
                      The verifier overrode the model here. This is the safety net working.
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

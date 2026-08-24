"use client";

import Link from "next/link";
import { useState } from "react";
import { BrainCircuit, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { friendlyClaim, friendlyCode, friendlyStatus, formatDateTime } from "@/components/console-ui";
import { cn } from "@/lib/utils";
import type { AiInvestigation } from "@/server/investigations";

function aiSuggestion(action: "prove" | "except" | "abstain"): string {
  return action === "prove" ? "Looks valid" : action === "except" ? "Found an issue" : "Could not decide";
}

export function PaymentInvestigation({
  saleId,
  closeId,
  configured,
  model,
  initial,
  canRun = true,
}: {
  saleId: string;
  closeId: string;
  configured: boolean;
  model: string | null;
  initial: AiInvestigation | null;
  canRun?: boolean;
}) {
  const [result, setResult] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function investigate() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sale_id: saleId, close_id: closeId }),
      });
      const body = (await response.json()) as AiInvestigation & { error?: string };
      if (!response.ok) throw new Error(body.error || "AI investigation failed.");
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI investigation failed.");
    } finally {
      setPending(false);
    }
  }

  const confirmed = result?.claims.filter((claim) => claim.verifier_accepted).length ?? 0;
  const rejected = result?.claims.filter((claim) => !claim.verifier_accepted && claim.ai_action !== "abstain").length ?? 0;

  return (
    <div className="mt-4 rounded-xl border border-brand/20 bg-brand/[0.025] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <BrainCircuit aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
          <div>
            <p className="font-medium">AI investigation</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              AI examines the stored evidence and explains this payment. Vera independently verifies every suggestion.
            </p>
            {result ? <p className="mt-2 text-xs text-muted-foreground">Last run {formatDateTime(result.created_at)} with {result.model}</p> : configured ? <p className="mt-2 text-xs text-muted-foreground">Ready to investigate with {model ?? "your configured model"}.</p> : null}
          </div>
        </div>
        {configured && canRun ? (
          <Button type="button" onClick={investigate} disabled={pending} className="h-9 shrink-0 px-4">
            {pending ? "Investigating…" : result ? "Run again" : "Investigate with AI"}
          </Button>
        ) : configured ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Historical report</span>
        ) : (
          <Link href="/app/settings#ai" className={cn(buttonVariants(), "h-9 shrink-0 px-4")}>Connect AI</Link>
        )}
      </div>

      {error ? <p role="alert" className="mt-3 text-sm text-bad">{error}</p> : null}

      {result ? (
        <div className="mt-4 border-t border-brand/15 pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-ok"><ShieldCheck aria-hidden className="size-4" />{confirmed} AI suggestions verified</span>
            {rejected ? <span className="font-medium text-bad">{rejected} rejected by Vera</span> : null}
            <span className="text-muted-foreground">{result.tool_calls} evidence lookups</span>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-brand">View AI findings and Vera’s decisions</summary>
            <div className="mt-3 grid gap-2">
              {result.claims.map((claim) => (
                <div key={claim.type} className="rounded-lg border border-border bg-background/70 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium">{friendlyClaim(claim.type)}</p>
                    <p className="text-xs text-muted-foreground">AI: {aiSuggestion(claim.ai_action)}{claim.ai_code ? ` · ${friendlyCode(claim.ai_code)}` : ""}</p>
                  </div>
                  <p className={cn("mt-1 text-sm", claim.final_status === "PROVEN" ? "text-ok" : "text-bad")}>Vera: {friendlyStatus(claim.final_status)}{claim.final_code ? ` · ${friendlyCode(claim.final_code)}` : ""}</p>
                  {claim.rationale ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{claim.rationale}</p> : null}
                  {!claim.verifier_accepted && claim.ai_action !== "abstain" ? <p className="mt-1 text-xs font-medium text-bad">Vera rejected this AI suggestion because the evidence did not support it.</p> : null}
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { BrainCircuit, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { friendlyClaim, friendlyCode, friendlyStatus, formatDateTime } from "@/components/console-ui";
import { cn } from "@/lib/utils";
import type { AiInvestigation } from "@/server/investigations";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";

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
            {result ? <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(result.created_at)} · {result.model}</p> : configured ? <p className="mt-1 text-xs text-muted-foreground">{model ?? "Configured model"}</p> : null}
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

      {error ? <Notice tone="error" role="alert" className="mt-3">{error}</Notice> : null}

      {result ? (
        <div className="mt-4 border-t border-brand/15 pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-ok"><ShieldCheck aria-hidden className="size-4" />{confirmed} verified</span>
            {rejected ? <span className="font-medium text-bad">{rejected} rejected</span> : null}
            <span className="text-muted-foreground">{result.tool_calls} evidence lookups</span>
          </div>
          <Disclosure title="Findings" className="mt-3" triggerClassName="text-brand" panelClassName="pt-3">
            <div className="grid gap-2">
              {result.claims.map((claim) => (
                <div key={claim.type} className="rounded-lg border border-border bg-background/70 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium">{friendlyClaim(claim.type)}</p>
                    <p className="text-xs text-muted-foreground">AI: {aiSuggestion(claim.ai_action)}{claim.ai_code ? ` · ${friendlyCode(claim.ai_code)}` : ""}</p>
                  </div>
                  <p className={cn("mt-1 text-sm", claim.final_status === "PROVEN" ? "text-ok" : "text-bad")}>Vera: {friendlyStatus(claim.final_status)}{claim.final_code ? ` · ${friendlyCode(claim.final_code)}` : ""}</p>
                  {claim.rationale ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{claim.rationale}</p> : null}
                  {!claim.verifier_accepted && claim.ai_action !== "abstain" ? <p className="mt-1 text-xs font-medium text-bad">Rejected by evidence</p> : null}
                </div>
              ))}
            </div>
          </Disclosure>
        </div>
      ) : null}
    </div>
  );
}

import type { EvalReport } from "./eval";
import type { RunResult } from "./orchestrate";
import { CLAIM_TYPES, inr, type Claim, type World } from "./types";

export function formatEval(report: EvalReport): string {
  const lines: string[] = [];
  lines.push(`Mandate Claim Ledger eval (seed ${report.seed})`);
  lines.push("=".repeat(52));
  lines.push(`Agent sales          : ${report.agentSales}`);
  lines.push(`Planted-fault sales  : ${report.plantedSales}`);
  lines.push(`Claims processed     : ${report.claimsProcessed}`);
  lines.push(
    `Sale-claim closure   : ${(report.closureRate * 100).toFixed(1)}% (${report.closed}/${report.claimsProcessed})`
  );
  lines.push(
    `Planted recall       : ${(report.plantedRecall * 100).toFixed(1)}% (${report.plantedCaught}/${report.plantedSales})`
  );
  lines.push(`False prove          : ${report.falseProve}`);
  lines.push(`Challenges raised    : ${report.challenges}`);
  lines.push(
    `Tool calls / sale    : total ${report.toolCalls.total}, p50 ${report.toolCalls.p50}, p95 ${report.toolCalls.p95}`
  );
  lines.push("");
  lines.push("Exceptions by code:");
  for (const [code, count] of Object.entries(report.exceptionsByCode).sort()) {
    lines.push(`  ${code.padEnd(24)} ${count}`);
  }
  lines.push("");
  lines.push("Naive baseline (amount + date join only):");
  lines.push(`  Planted faults it misses : ${report.naive.falseClean}`);
  lines.push(`  Planted faults it catches: ${report.naive.caught}`);
  lines.push("");
  if (report.openOrAbstained.length) {
    lines.push(`Open / abstained (${report.openOrAbstained.length}):`);
    for (const item of report.openOrAbstained) lines.push(`  ${item}`);
    lines.push("");
  }
  if (report.falseProveExamples.length) {
    lines.push(`False-prove claims: ${report.falseProveExamples.join(", ")}`);
    lines.push("");
  }
  lines.push("Gates:");
  lines.push(`  min claims (>=50)        : ${report.claimsProcessed >= 50 ? "PASS" : "FAIL"}`);
  lines.push(`  closure (>=95%)          : ${report.closureRate >= 0.95 ? "PASS" : "FAIL"}`);
  lines.push(`  planted recall (==100%)  : ${report.plantedRecall >= 1 ? "PASS" : "FAIL"}`);
  lines.push(`  false prove (==0)        : ${report.falseProve === 0 ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push(report.pass ? "RESULT: PASS" : `RESULT: FAIL (${report.gateFailures.join(", ")})`);
  return lines.join("\n");
}

export function formatSale(world: World, run: RunResult, saleId: string): string {
  const sale = world.sales.find((s) => s.sale_id === saleId);
  if (!sale) return `No such sale: ${saleId}`;
  const payment = world.payments.find((p) => p.payment_id === sale.payment_id);
  const cart = world.carts.find((c) => c.cart_id === sale.cart_id);

  const lines: string[] = [];
  lines.push(`Sale ${sale.sale_id}  (planted fault: ${sale.fault ?? "none"})`);
  lines.push("-".repeat(52));
  lines.push(`Intent   ${sale.intent_id}`);
  lines.push(`Cart     ${sale.cart_id}  total ${cart ? inr(cart.total_paise) : "?"}`);
  lines.push(`Payment  ${sale.payment_id}  amount ${payment ? inr(payment.amount_paise) : "?"}  rail ${payment?.rail}`);
  lines.push("");
  lines.push("Claims:");
  const byId = new Map<string, Claim>(run.claims.map((c) => [c.claim_id, c]));
  for (const type of CLAIM_TYPES) {
    const claim = byId.get(`${sale.sale_id}:${type}`);
    const status = claim?.status ?? "?";
    const detail = claim?.code ? ` ${claim.code}` : claim?.reject_reason ? ` (${claim.reject_reason})` : "";
    lines.push(`  ${type.padEnd(14)} ${status}${detail}`);
  }
  lines.push("");
  const traceForSale = run.transcript.entries.length;
  lines.push(`Tool calls this run: ${traceForSale} total; challenges: ${run.challenges.length}`);
  return lines.join("\n");
}

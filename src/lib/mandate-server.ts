import { buildChain, chainHead, verifyChain } from "@/mandate/audit";
import { buildFixture, DEFAULT_CONFIG } from "@/mandate/fixture";
import { evaluate } from "@/mandate/eval";
import { runClose } from "@/mandate/orchestrate";
import { ingest } from "@/mandate/adapters";
import { EXAMPLE_RECORDS } from "@/mandate/examples";
import { discoverDeterministic, extractFeatures } from "@/mandate/anomaly";
import { buildMatchFixture } from "@/mandate/matching/fixture";
import { reconcileDeterministic } from "@/mandate/matching/reconcile";
import { riskControlledReconcile } from "@/mandate/matching/riskcontrol";
import { inr, type Claim } from "@/mandate/types";

export type LedgerSnapshot = {
  seed: number;
  eval: ReturnType<typeof evaluate>;
  exceptions: {
    claim_id: string;
    sale_id: string;
    type: string;
    code: string;
    fault: string | null;
  }[];
  plantedSales: {
    sale_id: string;
    fault: string;
    claims: { type: string; status: string; code?: string }[];
  }[];
  chain: { events: number; head: string; ok: boolean };
  external: {
    sale_id: string;
    type: string;
    code: string;
  }[];
  matching: {
    credits: number;
    units: number;
    matched: number;
    n_to_one: number;
    ambiguous: number;
    unexplained: number;
    matched_value: string;
    verify_ok: boolean;
  };
  risk: {
    alpha: number;
    coverage: number;
    guaranteed_error: number;
    empirical_error: number;
    abstained: number;
  };
  anomaly: {
    planted_rings: number;
    discovered: { name: string; description: string; fires: string[]; coverage: number; status: string } | null;
  };
};

export function getLedgerSnapshot(seed = DEFAULT_CONFIG.seed): LedgerSnapshot {
  const { world } = buildFixture({ seed });
  const run = runClose(world);
  const report = evaluate({ seed });

  const byId = new Map<string, Claim>(run.claims.map((c) => [c.claim_id, c]));
  const faultBySale = new Map(world.sales.map((s) => [s.sale_id, s.fault]));

  const exceptions = run.claims
    .filter((c) => c.status === "EXCEPTED" && c.code)
    .map((c) => ({
      claim_id: c.claim_id,
      sale_id: c.sale_id,
      type: c.type,
      code: c.code as string,
      fault: faultBySale.get(c.sale_id) ?? null,
    }));

  const plantedSales = world.sales
    .filter((s) => s.fault)
    .map((s) => ({
      sale_id: s.sale_id,
      fault: s.fault as string,
      claims: (["AUTHORIZED", "CART_BOUND", "RECEIPTED", "IDEMPOTENT", "SETTLED", "BANKED", "REFUND_POLICY"] as const).map(
        (type) => {
          const claim = byId.get(`${s.sale_id}:${type}`);
          return { type, status: claim?.status ?? "?", code: claim?.code };
        }
      ),
    }));

  const events = buildChain(run);
  const chain = { events: events.length, head: chainHead(events), ok: verifyChain(events).ok };

  const externalRun = runClose(ingest(EXAMPLE_RECORDS));
  const external = externalRun.claims
    .filter((c) => c.status === "EXCEPTED" && c.code)
    .map((c) => ({ sale_id: c.sale_id, type: c.type, code: c.code as string }));

  const mf = buildMatchFixture({ seed });
  const recon = reconcileDeterministic(mf.problem);
  const matching = {
    credits: mf.problem.credits.length,
    units: mf.problem.units.length,
    matched: recon.coverage.matched,
    n_to_one: recon.matches.filter((m) => m.unit_ids.length > 1).length,
    ambiguous: recon.ambiguous_credit_ids.length,
    unexplained: recon.unexplained_credit_ids.length,
    matched_value: inr(recon.matched_value_paise),
    verify_ok: recon.verify.ok,
  };

  const rc = riskControlledReconcile();
  const risk = {
    alpha: rc.alpha,
    coverage: rc.test.coverage,
    guaranteed_error: rc.calibration.ub_error,
    empirical_error: rc.test.empirical_error,
    abstained: rc.test.abstained,
  };

  const discoveries = discoverDeterministic(extractFeatures(world));
  const top = discoveries[0];
  const anomaly = {
    planted_rings: buildFixture({ seed }).anomaly_key.structuring_rings.length,
    discovered: top
      ? {
          name: top.rule.name,
          description: top.rule.description,
          fires: top.validation.fires,
          coverage: top.validation.coverage,
          status: top.status,
        }
      : null,
  };

  return { seed, eval: report, exceptions, plantedSales, chain, external, matching, risk, anomaly };
}

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ingest, type ExternalRecord } from "./adapters";
import { exportBundle, verifyBundle, type AuditBundle } from "./bundle";
import { buildFixture } from "./fixture";
import { evaluate } from "./eval";
import { EXAMPLE_RECORDS } from "./examples";
import { getModelFromEnv } from "./llm";
import { discoverDeterministic, extractFeatures, proposeAnomalyWithModel } from "./anomaly";
import { buildMatchFixture } from "./matching/fixture";
import { reconcileDeterministic, reconcileWithModel } from "./matching/reconcile";
import { riskControlledReconcile } from "./matching/riskcontrol";
import { inr } from "./types";
import { runClose } from "./orchestrate";
import { formatEval, formatSale } from "./reports";
import type { World } from "./types";

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      flags[key] = value;
    }
  }
  return flags;
}

function seedOf(flags: Record<string, string>): number {
  const raw = flags.seed ? Number(flags.seed) : 42;
  if (!Number.isInteger(raw)) throw new Error(`--seed must be an integer, got ${flags.seed}`);
  return raw;
}

function outDir(): string {
  const dir = resolve(process.cwd(), "mandate-data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function worldFrom(flags: Record<string, string>): World {
  if (flags.ingest) {
    const raw = readFileSync(resolve(process.cwd(), flags.ingest), "utf8");
    const records = JSON.parse(raw) as ExternalRecord[];
    return ingest(records);
  }
  if (flags.examples) {
    return ingest(EXAMPLE_RECORDS);
  }
  return buildFixture({ seed: seedOf(flags) }).world;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (command) {
    case "fixture:build": {
      const fixture = buildFixture({ seed: seedOf(flags) });
      writeFileSync(resolve(outDir(), "fixture.json"), JSON.stringify(fixture.world, null, 2));
      writeFileSync(resolve(outDir(), "answer-key.json"), JSON.stringify(fixture.answer_key, null, 2));
      console.log(
        `Wrote mandate-data/fixture.json (${fixture.world.sales.length} agent sales) and answer-key.json (${fixture.answer_key.length} claims).`
      );
      return 0;
    }

    case "close": {
      const world = worldFrom(flags);
      const run = runClose(world);
      const proven = run.claims.filter((c) => c.status === "PROVEN").length;
      const excepted = run.claims.filter((c) => c.status === "EXCEPTED").length;
      const abstained = run.claims.filter((c) => c.status === "ABSTAINED").length;
      console.log(`Closed ${world.sales.length} agent sales (planner: ${run.planner}).`);
      console.log(`  PROVEN ${proven}  EXCEPTED ${excepted}  ABSTAINED ${abstained}`);
      console.log(`  Challenges: ${run.challenges.length}  Tool calls: ${run.transcript.entries.length}`);
      return 0;
    }

    case "eval": {
      const report = evaluate({ seed: seedOf(flags) });
      console.log(formatEval(report));
      return report.pass ? 0 : 1;
    }

    case "show": {
      const saleId = flags.sale;
      if (!saleId) {
        console.error("show requires --sale <sale_id>");
        return 1;
      }
      const world = worldFrom(flags);
      const run = runClose(world);
      console.log(formatSale(world, run, saleId));
      return 0;
    }

    case "ingest": {
      const world = worldFrom({ ...flags, examples: flags.ingest ? "" : "true" });
      const run = runClose(world);
      const excepted = run.claims.filter((c) => c.status === "EXCEPTED");
      console.log(`Ingested ${world.sales.length} external sales.`);
      for (const claim of excepted) {
        console.log(`  ${claim.sale_id} ${claim.type} -> ${claim.code}`);
      }
      if (excepted.length === 0) console.log("  No exceptions: every claim proven.");
      return 0;
    }

    case "bundle": {
      const world = worldFrom(flags);
      const bundle = exportBundle(world);
      const path = resolve(outDir(), "audit-bundle.json");
      writeFileSync(path, JSON.stringify(bundle, null, 2));
      console.log(`Wrote ${path}`);
      console.log(`  head ${bundle.head.slice(0, 16)}…  events ${bundle.events.length}`);
      console.log(
        `  PROVEN ${bundle.summary.proven}  EXCEPTED ${bundle.summary.excepted}  ABSTAINED ${bundle.summary.abstained}`
      );
      return 0;
    }

    case "match": {
      const { problem, key } = buildMatchFixture({ seed: seedOf(flags) });
      const useModel = flags.llm !== undefined;
      const run = useModel
        ? await (async () => {
            const model = getModelFromEnv();
            if (!model) {
              console.error("match --llm needs ANTHROPIC_API_KEY or OPENAI_API_KEY");
              return reconcileDeterministic(problem);
            }
            return reconcileWithModel(model, problem);
          })()
        : reconcileDeterministic(problem);

      console.log(`Reconciliation (${run.source}): ${problem.credits.length} credits, ${problem.units.length} units`);
      console.log(`  matched credits : ${run.coverage.matched}/${run.coverage.credits}`);
      console.log(`  matched value   : ${inr(run.matched_value_paise)}`);
      console.log(`  ambiguous       : ${run.ambiguous_credit_ids.length} ${run.ambiguous_credit_ids.join(", ")}`);
      console.log(`  unexplained     : ${run.unexplained_credit_ids.length} ${run.unexplained_credit_ids.join(", ")}`);
      console.log(`  in-transit units: ${run.in_transit_unit_ids.length}`);
      console.log(`  verifier ok     : ${run.verify.ok}`);
      console.log(`  (fixture planted ${key.true_groups.length} true groups, ${key.ambiguous_credit_ids.length} decoys)`);
      const nContra = run.matches.filter((m: { unit_ids: string[] }) => m.unit_ids.length > 1).length;
      console.log(`  N:1 matches     : ${nContra} (a plain 1:1 matcher would miss these)`);
      return 0;
    }

    case "risk": {
      const report = riskControlledReconcile();
      console.log(`Risk-controlled reconciliation (alpha=${report.alpha}, delta=${report.delta})`);
      console.log(`  calibrated threshold : ${report.calibration.threshold}`);
      console.log(`  upper bound on error : ${(report.calibration.ub_error * 100).toFixed(2)}%`);
      console.log(`  held-out coverage    : ${(report.test.coverage * 100).toFixed(1)}% of matches accepted`);
      console.log(`  held-out accepted err: ${(report.test.empirical_error * 100).toFixed(2)}% (guaranteed <= ${report.alpha * 100}%)`);
      console.log(`  abstained to humans  : ${report.test.abstained}`);
      return 0;
    }

    case "anomaly": {
      const { world, anomaly_key } = buildFixture({ seed: seedOf(flags) });
      const features = extractFeatures(world);
      if (flags.llm !== undefined) {
        const model = getModelFromEnv();
        if (!model) {
          console.error("anomaly --llm needs ANTHROPIC_API_KEY or OPENAI_API_KEY");
          return 1;
        }
        const proposal = await proposeAnomalyWithModel(model, features);
        console.log(`Model proposed anomaly (${proposal.status}):`);
        if (proposal.rule) console.log(`  ${proposal.rule.name}: ${proposal.rule.description}`);
        if (proposal.validation) {
          console.log(`  fires on ${proposal.validation.fires.length} sales (${(proposal.validation.coverage * 100).toFixed(1)}%): ${proposal.validation.fires.join(", ")}`);
          console.log(`  ${proposal.validation.reason}`);
        }
        return 0;
      }
      const found = discoverDeterministic(features);
      console.log(`Discovered ${found.length} candidate anomaly rule(s). Planted rings: ${anomaly_key.structuring_rings.length}.`);
      for (const d of found.slice(0, 3)) {
        console.log(`  [${d.status}] ${d.rule.name}`);
        console.log(`    ${d.rule.description}`);
        console.log(`    fires on ${d.validation.fires.length} sales (${(d.validation.coverage * 100).toFixed(1)}%): ${d.validation.fires.join(", ")}`);
      }
      return 0;
    }

    case "verify-bundle": {
      const file = flags.file ?? resolve(outDir(), "audit-bundle.json");
      const bundle = JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8")) as AuditBundle;
      const verdict = verifyBundle(bundle);
      console.log(`Bundle: ${file}`);
      console.log(`  chain      : ${verdict.chain_ok ? "OK" : `BROKEN at ${verdict.chain_broken_at}`}`);
      console.log(`  head       : ${verdict.head_ok ? "OK" : "MISMATCH"}`);
      console.log(`  signature  : ${verdict.signature_ok ? "OK" : "INVALID"}`);
      console.log(`  world hash : ${verdict.world_hash_ok ? "OK" : "MISMATCH"}`);
      console.log(`  replay     : ${verdict.replay_ok ? "OK" : "DIVERGED"}`);
      if (verdict.notes.length) console.log(`  notes: ${verdict.notes.join("; ")}`);
      console.log(verdict.ok ? "RESULT: VERIFIED" : "RESULT: FAILED");
      return verdict.ok ? 0 : 1;
    }

    default:
      console.log(
        [
          "Mandate Claim Ledger CLI",
          "",
          "Commands:",
          "  fixture:build [--seed N]        Write fixture + answer key to mandate-data/",
          "  close [--seed N|--examples|--ingest f.json]  Run the close, print summary",
          "  eval  [--seed N]                Score vs answer key, exit 1 on gate failure",
          "  show  --sale <id> [--seed N|--examples]      Print one sale's claims",
          "  ingest [--ingest f.json]        Close external AP2/ACP/x402 records (examples by default)",
          "  match [--seed N] [--llm]        N:1 settlement↔bank reconciliation (solver-verified)",
          "  risk                            Conformal risk-controlled match rate (guaranteed error)",
          "  anomaly [--seed N] [--llm]      Open-world anomaly discovery (structuring, etc.)",
          "  bundle [--seed N|--examples]    Export a signed, hash-chained audit bundle",
          "  verify-bundle [--file f.json]   Offline-verify a bundle (chain, signature, replay)",
        ].join("\n")
      );
      return command ? 1 : 0;
  }
}

main().then((code) => process.exit(code));

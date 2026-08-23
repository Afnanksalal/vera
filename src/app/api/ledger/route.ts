import { NextResponse } from "next/server";
import { getLedgerSnapshot } from "@/lib/mandate-server";

export const dynamic = "force-static";

export function GET() {
  const snap = getLedgerSnapshot();
  return NextResponse.json({
    seed: snap.seed,
    summary: {
      claims: snap.eval.claimsProcessed,
      closureRate: snap.eval.closureRate,
      plantedRecall: snap.eval.plantedRecall,
      falseProve: snap.eval.falseProve,
      naive: snap.eval.naive,
      exceptionsByCode: snap.eval.exceptionsByCode,
      chain: snap.chain,
      pass: snap.eval.pass,
    },
    exceptions: snap.exceptions,
    external: snap.external,
  });
}

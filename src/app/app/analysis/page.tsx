import { AnalysisConsole } from "@/components/analysis-console";
import { currentUser } from "@/server/http";
import { aiSettingsPublic } from "@/server/settings";
import { recordsForUser } from "@/server/ledger";
import { ingest } from "@/mandate/adapters";
import { AiInvestigator } from "@/components/ai-investigator";
import { CalibrationForm } from "@/components/calibration-form";
import { calibrationStatus } from "@/server/calibration";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const user = await currentUser();
  if (!user) return null;
  const ai = aiSettingsPublic(user.id);
  const records = recordsForUser(user.id);
  const sales = records.length ? ingest(records).sales.map(({ sale_id }) => ({ sale_id })) : [];
  return <div className="grid gap-8"><div><h2 className="text-lg font-semibold">Reconciliation and anomaly console</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Every result is computed from this workspace’s ingested records. Models may propose; deterministic solvers and validators decide.</p></div><CalibrationForm rows={calibrationStatus(user.id).rows}/><AnalysisConsole aiConfigured={ai.configured}/>{sales.length ? <AiInvestigator sales={sales} status={{ enabled: ai.configured, provider: ai.provider, name: ai.model }}/>: null}</div>;
}

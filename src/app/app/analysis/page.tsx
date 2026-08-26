import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { AnalysisConsole } from "@/components/analysis-console";
import { currentUser } from "@/server/http";
import { aiSettingsPublic } from "@/server/settings";
import { recordsForUser } from "@/server/ledger";
import { ingest } from "@/mandate/adapters";
import { AiInvestigator } from "@/components/ai-investigator";
import { CalibrationForm } from "@/components/calibration-form";
import { calibrationStatus } from "@/server/calibration";
import { EmptyState, PageHeader } from "@/components/console-ui";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const user = await currentUser(); if (!user) return null;
  const ai = aiSettingsPublic(user.id);
  const records = recordsForUser(user.id);
  const sales = records.length ? ingest(records).sales.map(({ sale_id }) => ({ sale_id })) : [];
  return <div className="grid gap-8"><PageHeader title="Reconcile" />{records.length === 0 ? <EmptyState icon={BarChart3} title="No records to reconcile" action={<Link href="/app" className={cn(buttonVariants(), "h-10")}>Import records</Link>} /> : <><AnalysisConsole aiConfigured={ai.configured}/>{sales.length && ai.configured ? <AiInvestigator sales={sales} status={{ enabled: true, provider: ai.provider, name: ai.model }}/> : null}<CalibrationForm rows={calibrationStatus(user.id).rows}/></>}</div>;
}

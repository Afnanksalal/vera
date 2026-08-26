import { EvidenceForm } from "@/components/evidence-form";
import { EmptyState, PageHeader, Panel } from "@/components/console-ui";
import { currentUser } from "@/server/http";
import { recordsForUser } from "@/server/ledger";
import { FileCheck2 } from "lucide-react";
import { BankCsvImport } from "@/components/bank-csv-import";

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  const user = (await currentUser())!;
  const payments = recordsForUser(user.id).map((record) => ({ id: record.payment.id, amount_paise: record.payment.amount_minor, intent_id: record.ap2_intent?.id ?? null, settlement_net: record.settlement?.net_minor ?? null, settlement_utr: record.settlement?.psp_ref.includes("/") ? record.settlement.psp_ref.split("/").at(-1) ?? null : record.settlement?.psp_ref ?? null }));
  return <div className="grid gap-8"><PageHeader title="Evidence" />{payments.length === 0 ? <EmptyState icon={FileCheck2} title="No payments" /> : <>
    <Panel><h2 className="mb-5 font-semibold">Processor settlement</h2><EvidenceForm payments={payments} kind="processor" /></Panel>
    <Panel><h2 className="mb-5 font-semibold">Bank statement import</h2><BankCsvImport /></Panel>
    <Panel><h2 className="mb-5 font-semibold">Single bank credit</h2><EvidenceForm payments={payments} kind="bank_statement" /></Panel>
  </>}</div>;
}

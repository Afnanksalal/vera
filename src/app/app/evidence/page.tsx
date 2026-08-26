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
  return <div className="grid gap-8"><PageHeader title="Evidence" description="Attach processor and bank source documents as they arrive. Vera hashes the original file, updates the payment, and creates a new signed report." /><p className="-mt-5 text-xs text-muted-foreground">Source files are embedded in downloadable audit bundles. Treat exported bundles as sensitive financial records.</p>{payments.length === 0 ? <EmptyState icon={FileCheck2} title="No payments yet" description="Create or import a payment before attaching settlement and bank evidence." /> : <>
    <Panel><div className="mb-5"><h2 className="font-semibold">Processor settlement</h2><p className="mt-1 text-sm text-muted-foreground">Prefer Razorpay reconciliation sync in Settings. Use this form for another processor or a source report Vera cannot fetch directly.</p></div><EvidenceForm payments={payments} kind="processor" /></Panel>
    <Panel><div className="mb-5"><h2 className="font-semibold">Bank statement import</h2><p className="mt-1 text-sm text-muted-foreground">Import a statement export once and match up to 200 payments without re-uploading the same source file.</p></div><BankCsvImport /></Panel>
    <Panel><div className="mb-5"><h2 className="font-semibold">Single bank credit</h2><p className="mt-1 text-sm text-muted-foreground">Attach the original statement and one exact credit line. Vera matches settlement net, date, UTR, and mandate provenance.</p></div><EvidenceForm payments={payments} kind="bank_statement" /></Panel>
  </>}</div>;
}

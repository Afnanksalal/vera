import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>{action ? <div className="shrink-0">{action}</div> : null}</div>;
}

export function Panel({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-6", className)}>{children}</section>;
}

export function Metric({ label, value, detail, tone = "default" }: { label: string; value: string | number; detail?: string; tone?: "default" | "good" | "bad" }) {
  return <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={cn("mt-2 text-3xl font-semibold tabular-nums", tone === "good" && "text-ok", tone === "bad" && "text-bad")}>{value}</p>{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}</div>;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center"><span className="flex size-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon aria-hidden className="size-5" /></span><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>{action ? <div className="mt-5">{action}</div> : null}</div>;
}

const CLAIM_LABELS: Record<string, string> = { AUTHORIZED: "Purchase authorization", CART_BOUND: "Cart details", RECEIPTED: "Receipt", IDEMPOTENT: "Duplicate charge", SETTLED: "Processor settlement", BANKED: "Bank deposit", REFUND_POLICY: "Refund handling" };
const CODE_LABELS: Record<string, string> = { MANDATE_ATTESTATION_MISSING: "Mandate is missing", MANDATE_ATTESTATION_INVALID: "Mandate signature is invalid", MANDATE_OVERSPEND: "Purchase exceeds the mandate", MANDATE_EXPIRED: "Mandate had expired", CART_ATTESTATION_MISSING: "Signed cart is missing", CART_ATTESTATION_INVALID: "Cart signature is invalid", CART_PAYMENT_MISMATCH: "Cart does not match the payment", RECEIPT_ABSENT: "Receipt is missing", RETRY_DOUBLE_BOOK: "Possible duplicate payment", SETTLEMENT_ABSENT: "Settlement evidence is missing", SETTLEMENT_DRIFT: "Settlement amount does not match", BANK_CREDIT_ABSENT: "Bank deposit evidence is missing", CHANNEL_UNTAGGED: "Payment channel is not identified", ORPHAN_REFUND: "Refund has no matching payment", DOUBLE_REFUND: "Payment may have been refunded twice" };

export function friendlyClaim(value: string): string { return CLAIM_LABELS[value] ?? sentenceCase(value); }
export function friendlyCode(value: string | null | undefined): string { return value ? CODE_LABELS[value] ?? sentenceCase(value) : "More evidence is needed"; }
export function friendlyStatus(value: string): string { return value === "PROVEN" ? "Passed" : value === "EXCEPTED" ? "Needs attention" : value === "ABSTAINED" ? "Inconclusive" : sentenceCase(value); }
export function formatDateTime(value: number): string { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
export function StatusPill({ status }: { status: string }) { const good = status === "PROVEN"; const warning = status === "ABSTAINED"; return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", good ? "bg-ok/10 text-ok" : warning ? "bg-amber-500/10 text-amber-700" : "bg-bad/10 text-bad")}>{friendlyStatus(status)}</span>; }
function sentenceCase(value: string): string { const text = value.toLowerCase().replaceAll("_", " "); return text ? text[0].toUpperCase() + text.slice(1) : text; }

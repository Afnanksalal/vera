import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function Notice({ children, tone = "info", role = "status", className }: { children: React.ReactNode; tone?: "info" | "success" | "error"; role?: "status" | "alert"; className?: string }) {
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return <div role={role} aria-live={role === "alert" ? "assertive" : "polite"} className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm", tone === "error" ? "border-bad/20 bg-bad/[0.04] text-bad" : tone === "success" ? "border-ok/20 bg-ok/[0.04] text-ok" : "border-brand/15 bg-brand/[0.035] text-foreground", className)}><Icon aria-hidden className="mt-0.5 size-4 shrink-0"/><div className="min-w-0 break-words">{children}</div></div>;
}

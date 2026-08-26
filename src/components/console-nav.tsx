"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AlertCircle, BarChart3, CreditCard, Ellipsis, FileCheck2, LayoutDashboard, Settings, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/analysis", label: "Reconcile", icon: BarChart3 },
  { href: "/app/review", label: "Issues", icon: AlertCircle },
  { href: "/app/closes", label: "Reports", icon: FileCheck2 },
  { href: "/app/pay", label: "Purchase", icon: CreditCard },
  { href: "/app/evidence", label: "Evidence", icon: ShieldCheck },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function ConsoleNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = items.filter((item) => ["/app", "/app/analysis", "/app/review", "/app/pay"].includes(item.href));
  const secondary = items.filter((item) => !primary.includes(item));
  const moreActive = secondary.some(({ href }) => pathname.startsWith(href));
  const link = ({ href, label, icon: Icon, exact }: (typeof items)[number], mobile = false) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return <Link key={href} href={href} onClick={() => setMoreOpen(false)} aria-current={active ? "page" : undefined} className={cn(mobile ? "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium" : "flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors", active ? "text-brand lg:bg-brand/10" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon aria-hidden className="size-5 shrink-0 lg:size-4" /><span className="truncate">{mobile && label === "Overview" ? "Home" : label}</span></Link>;
  };
  return <>
    <nav aria-label="Console" className="hidden lg:grid lg:grid-cols-1 lg:gap-1">{items.map((item) => link(item))}</nav>
    {moreOpen ? <div className="fixed inset-0 z-40 bg-black/25 lg:hidden" onClick={() => setMoreOpen(false)}><div role="dialog" aria-label="More console pages" className="absolute inset-x-3 bottom-20 rounded-2xl border border-border bg-background p-3 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-2 flex items-center justify-between px-2"><p className="text-sm font-semibold">More</p><button type="button" aria-label="Close more menu" className="rounded-full p-2 text-muted-foreground" onClick={() => setMoreOpen(false)}><X className="size-5" /></button></div><div className="grid grid-cols-3 gap-1">{secondary.map((item) => link(item, true))}</div></div></div> : null}
    <nav aria-label="Console" className="fixed inset-x-0 bottom-0 z-50 flex min-h-16 border-t border-border bg-background/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">{primary.map((item) => link(item, true))}<button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)} className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium", moreActive || moreOpen ? "text-brand" : "text-muted-foreground")}><Ellipsis aria-hidden className="size-5"/><span>More</span></button></nav>
  </>;
}

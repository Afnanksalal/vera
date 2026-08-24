"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, BarChart3, CreditCard, FileCheck2, LayoutDashboard, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/analysis", label: "Reconcile", icon: BarChart3 },
  { href: "/app/review", label: "Issues", icon: AlertCircle },
  { href: "/app/closes", label: "Reports", icon: FileCheck2 },
  { href: "/app/pay", label: "Test pay", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function ConsoleNav() {
  const pathname = usePathname();
  return <nav aria-label="Console" className="grid grid-cols-3 gap-1 sm:grid-cols-6 lg:grid-cols-1">{items.map(({ href, label, icon: Icon, exact }) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-center text-sm font-medium transition-colors lg:justify-start lg:px-3 lg:text-left", active ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon aria-hidden className="hidden size-4 shrink-0 lg:block" /><span className="truncate">{label}</span></Link>;
  })}</nav>;
}

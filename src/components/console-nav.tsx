"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, BarChart3, CreditCard, Ellipsis, FileCheck2, LayoutDashboard, Settings, ShieldCheck, X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
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
  const link = ({ href, label, icon: Icon, exact }: (typeof items)[number], mobile = false, closeOnClick = false) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return <Link key={href} href={href} onClick={closeOnClick ? () => setMoreOpen(false) : undefined} aria-current={active ? "page" : undefined} className={cn(mobile ? "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium" : "flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors", active ? "text-brand lg:bg-brand/10" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon aria-hidden className="size-5 shrink-0 lg:size-4" /><span className="truncate">{mobile && label === "Overview" ? "Home" : label}</span></Link>;
  };
  return <>
    <nav aria-label="Console" className="hidden lg:grid lg:grid-cols-1 lg:gap-1">{items.map((item) => link(item))}</nav>
    <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
      <nav aria-label="Console" className="fixed inset-x-0 bottom-0 z-50 flex min-h-16 border-t border-border bg-background/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">{primary.map((item) => link(item, true))}<Dialog.Trigger className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand", moreActive ? "text-brand" : "text-muted-foreground")}><Ellipsis aria-hidden className="size-5"/><span>More</span></Dialog.Trigger></nav>
      <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-40 bg-black/25 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0 lg:hidden"/><Dialog.Popup aria-label="More console pages" className="fixed inset-x-3 bottom-20 z-50 rounded-2xl border border-border bg-background p-3 shadow-xl transition-[transform,opacity] data-ending-style:translate-y-3 data-ending-style:opacity-0 data-starting-style:translate-y-3 data-starting-style:opacity-0 lg:hidden"><div className="mb-2 flex items-center justify-between px-2"><Dialog.Title className="text-sm font-semibold">More</Dialog.Title><Dialog.Close aria-label="Close more menu" className="rounded-full p-2 text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand"><X className="size-5" /></Dialog.Close></div><div className="grid grid-cols-3 gap-1">{secondary.map((item) => link(item, true, true))}</div></Dialog.Popup></Dialog.Portal>
    </Dialog.Root>
  </>;
}

"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclosure({ title, children, className, triggerClassName, panelClassName, defaultOpen = false }: { title: React.ReactNode; children: React.ReactNode; className?: string; triggerClassName?: string; panelClassName?: string; defaultOpen?: boolean }) {
  return <Collapsible.Root defaultOpen={defaultOpen} className={cn("group/disclosure", className)}>
    <Collapsible.Trigger className={cn("flex w-full items-center gap-2 rounded-lg text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50", triggerClassName)}>
      <span className="min-w-0 flex-1">{title}</span><ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[open]/disclosure:rotate-180"/>
    </Collapsible.Trigger>
    <Collapsible.Panel className={cn("h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0", panelClassName)}>{children}</Collapsible.Panel>
  </Collapsible.Root>;
}

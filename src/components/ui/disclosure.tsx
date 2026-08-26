"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type DisclosureProps = {
  title: React.ReactNode;
  children: React.ReactNode;
  leading?: React.ReactNode;
  summary?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  defaultOpen?: boolean;
};

export function Disclosure({ title, children, leading, summary, className, triggerClassName, panelClassName, defaultOpen = false }: DisclosureProps) {
  return <Collapsible.Root defaultOpen={defaultOpen} className={cn("group/disclosure", className)}>
    <Collapsible.Trigger className={cn("flex min-h-10 w-full items-center gap-3 rounded-lg text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50", triggerClassName)}>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        {leading ? <span className="flex shrink-0 items-center justify-center text-muted-foreground">{leading}</span> : null}
        <span className="min-w-0 flex-1 leading-5">{title}</span>
        {summary ? <span className="shrink-0 pl-2 text-xs font-normal leading-5 text-muted-foreground group-data-[open]/disclosure:hidden">{summary}</span> : null}
      </span>
      <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[open]/disclosure:rotate-180"/>
    </Collapsible.Trigger>
    <Collapsible.Panel className={cn("h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0", panelClassName)}>{children}</Collapsible.Panel>
  </Collapsible.Root>;
}

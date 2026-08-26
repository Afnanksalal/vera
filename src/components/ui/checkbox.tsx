"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function CheckboxField({ checked, onCheckedChange, label, description, disabled, className }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string; description?: string; disabled?: boolean; className?: string }) {
  return <label className={cn("flex cursor-pointer items-start gap-3 text-sm", disabled && "cursor-not-allowed opacity-50", className)}>
    <CheckboxPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-input bg-background outline-none transition-colors data-checked:border-brand data-checked:bg-brand data-checked:text-white focus-visible:ring-3 focus-visible:ring-ring/50">
      <CheckboxPrimitive.Indicator><Check className="size-3.5" strokeWidth={3}/></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
    <span><span className="font-medium">{label}</span>{description ? <span className="block text-xs leading-relaxed text-muted-foreground">{description}</span> : null}</span>
  </label>;
}

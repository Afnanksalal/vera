"use client";

import { forwardRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export const FileInput = forwardRef<HTMLInputElement, React.ComponentProps<"input"> & { buttonLabel?: string }>(function FileInput({ className, buttonLabel = "Choose file", onChange, ...props }, ref) {
  const [name, setName] = useState("No file selected");
  return <label className={cn("flex min-w-0 max-w-md cursor-pointer items-center gap-3 rounded-lg border border-input bg-background p-2 text-sm outline-none transition-colors hover:bg-muted focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50", className)}>
    <input {...props} ref={ref} type="file" className="sr-only" onChange={(event) => { setName(event.target.files?.[0]?.name ?? "No file selected"); onChange?.(event); }}/>
    <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md bg-muted px-3 font-medium"><Upload className="size-4"/>{buttonLabel}</span>
    <span className="min-w-0 truncate text-muted-foreground">{name}</span>
  </label>;
});

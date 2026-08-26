"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const command = "git clone https://github.com/Afnanksalal/vera.git\ncd vera\ndocker compose up -d --build";

export function SelfHostCta() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-12 sm:px-6">
      <section className="grid gap-6 rounded-2xl bg-foreground px-5 py-6 text-background sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">Self-host Vera</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Your infrastructure. Your financial records.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-background/70">Run the full product with Docker Compose, a persistent data volume, and no configuration file. Finish setup securely in the browser.</p>
          <div className="mt-5 flex min-w-0 items-stretch overflow-hidden rounded-xl border border-background/15 bg-background/[0.06]">
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs leading-5 text-background/85">{command}</code>
            <Button type="button" variant="ghost" onClick={copyCommand} className="h-auto shrink-0 rounded-none border-l border-background/15 px-4 text-background hover:bg-background/10 hover:text-background" aria-label="Copy self-host command">
              {copied ? <Check aria-hidden className="size-4 text-brand"/> : <Copy aria-hidden className="size-4"/>}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
        </div>
        <Link href="/docs#deploy" className={cn(buttonVariants({ size: "lg" }), "h-11 w-fit px-5")}>Self-hosting guide</Link>
      </section>
    </div>
  );
}

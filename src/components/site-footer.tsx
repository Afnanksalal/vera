import Image from "next/image";
import Link from "next/link";
import { REPOSITORY_URL } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-4 border-t border-border/80 bg-secondary/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-12 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Image src="/art/vera-icon.png" alt="Vera" width={26} height={26} className="rounded-md" />
            <span className="font-display text-base font-semibold tracking-tight">Vera</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The auditor for agent-made purchases. Vera proves or flags every step
            and keeps a signed record anyone can re-check.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-sm">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Product
            </span>
            <Link href="/app" className="text-muted-foreground hover:text-foreground">
              Web console
            </Link>
            <Link href="/#how" className="text-muted-foreground hover:text-foreground">
              How it works
            </Link>
            <Link href="/app/settings" className="text-muted-foreground hover:text-foreground">Settings</Link>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
              Source on GitHub
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Trust
            </span>
            <Link href="/app/closes" className="text-muted-foreground hover:text-foreground">
              Signed reports
            </Link>
            <Link href="/app/settings" className="text-muted-foreground hover:text-foreground">
              Installation settings
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-border/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>AP2, ACP, and x402 payments normalized into one signed, replayable ledger.</p>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className="w-fit hover:text-foreground hover:underline">Open-source on GitHub</a>
        </div>
      </div>
    </footer>
  );
}

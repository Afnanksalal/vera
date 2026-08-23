import Image from "next/image";
import Link from "next/link";

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
            <Link href="/ledger" className="text-muted-foreground hover:text-foreground">
              Live ledger
            </Link>
            <Link href="/#how" className="text-muted-foreground hover:text-foreground">
              How it works
            </Link>
            <a href="/api/ledger" className="text-muted-foreground hover:text-foreground">
              JSON API
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Run it
            </span>
            <span className="font-mono text-xs text-muted-foreground">npm run dev</span>
            <span className="font-mono text-xs text-muted-foreground">npm run mandate:eval</span>
            <span className="font-mono text-xs text-muted-foreground">npm run mandate bundle</span>
          </div>
        </div>
      </div>
      <div className="border-t border-border/80">
        <p className="mx-auto w-full max-w-6xl px-5 py-5 text-xs text-muted-foreground sm:px-6">
          AP2, ACP, and x402 payments normalized into one signed, replayable ledger.
        </p>
      </div>
    </footer>
  );
}

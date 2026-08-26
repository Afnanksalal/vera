import Image from "next/image";
import Link from "next/link";
import { LICENSE_URL, REPOSITORY_URL } from "@/lib/site";

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
        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
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
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
              GitHub
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Resources
            </span>
            <Link href="/docs" className="text-muted-foreground hover:text-foreground">Documentation</Link>
            <Link href="/security" className="text-muted-foreground hover:text-foreground">Security</Link>
            <a href={`${REPOSITORY_URL}/blob/main/docs/API.md`} className="text-muted-foreground hover:text-foreground">API reference</a>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Legal</span>
            <Link href="/terms" className="text-muted-foreground hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground">Privacy</Link>
            <a href={LICENSE_URL} className="text-muted-foreground hover:text-foreground">MIT License</a>
          </div>
        </div>
      </div>
      <div className="border-t border-border/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Vera contributors. Open-source under MIT.</p>
          <div className="flex gap-4"><Link href="/terms" className="hover:text-foreground hover:underline">Terms</Link><Link href="/privacy" className="hover:text-foreground hover:underline">Privacy</Link><Link href="/security" className="hover:text-foreground hover:underline">Security</Link></div>
        </div>
      </div>
    </footer>
  );
}

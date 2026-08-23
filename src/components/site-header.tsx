import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/#story", label: "What Vera does" },
  { href: "/#how", label: "How it works" },
  { href: "/#checks", label: "The checks" },
  { href: "/ledger", label: "Live ledger" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/art/vera-icon.png" alt="Vera" width={30} height={30} className="rounded-lg" />
          <span className="font-display text-[20px] font-semibold tracking-tight">Vera</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link href="/ledger" className={cn(buttonVariants({ size: "sm" }), "h-9 px-3.5")}>
          Open the ledger
        </Link>
      </div>
    </header>
  );
}

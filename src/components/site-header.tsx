import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { currentUser } from "@/server/http";

const links = [
  { href: "/#story", label: "What Vera does" },
  { href: "/#how", label: "How it works" },
  { href: "/#checks", label: "The checks" },
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
        <AuthButtons />
      </div>
    </header>
  );
}

async function AuthButtons() {
  const user = await currentUser();
  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-[14rem] truncate text-sm text-muted-foreground sm:inline">{user.email}</span>
        <Link href="/app" className={cn(buttonVariants({ size: "sm" }), "h-9 px-3.5")}>
          Open app
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
      >
        Sign in
      </Link>
      <Link href="/signup" className={cn(buttonVariants({ size: "sm" }), "h-9 px-3.5")}>
        Create account
      </Link>
    </div>
  );
}

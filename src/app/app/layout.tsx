import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/http";
import { safeRedirectPath } from "@/server/navigation";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/account-actions";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/app", label: "Ledger" },
  { href: "/app/analysis", label: "Analysis" },
  { href: "/app/closes", label: "Closes" },
  { href: "/app/review", label: "Review" },
  { href: "/app/pay", label: "Checkout verification" },
  { href: "/app/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser().catch(() => null);
  if (!user) {
    const destination = safeRedirectPath((await headers()).get("x-vera-request-path") ?? "/app");
    redirect(`/login?next=${encodeURIComponent(destination)}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Workspace</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Your mandate ledger</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <LogoutButton />
        </div>
      </div>
      {children}
    </div>
  );
}

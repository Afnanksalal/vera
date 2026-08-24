import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentUser } from "@/server/http";
import { safeRedirectPath } from "@/server/navigation";
import { ConsoleNav } from "@/components/console-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Console", template: "%s · Vera Console" },
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) {
    const destination = safeRedirectPath((await headers()).get("x-vera-request-path") ?? "/app");
    redirect(`/login?next=${encodeURIComponent(destination)}`);
  }

  return (
    <div data-console-shell className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6 sm:py-8">
      <div className="grid gap-7 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ConsoleNav />
        </aside>
        <div className="min-w-0 pb-8">{children}</div>
      </div>
    </div>
  );
}

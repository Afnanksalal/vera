import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/server/http";
import { installationHasUser } from "@/server/auth";
import { safeRedirectPath } from "@/server/navigation";

export const metadata: Metadata = { title: "Sign in · Vera" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; notice?: string | string[] }>;
}) {
  const query = await searchParams;
  const redirectTo = safeRedirectPath(query.next);
  if (await currentUser()) redirect(redirectTo);
  if (!installationHasUser()) redirect("/signup");
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in with the installation owner account. Integration API keys are managed in Settings.
      </p>
      {notice === "registration_closed" ? (
        <p role="status" className="mt-5 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
          Setup is complete. This installation accepts the existing owner account only.
        </p>
      ) : null}
      {notice === "signed_out" ? (
        <p role="status" className="mt-5 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
          You have been signed out.
        </p>
      ) : null}
      <div className="mt-8">
        <AuthForm mode="login" redirectTo={redirectTo} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/server/http";
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
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to your Vera workspace. Integration API keys are managed in Settings.
      </p>
      {notice === "signed_out" ? (
        <p role="status" className="mt-5 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
          You have been signed out.
        </p>
      ) : null}
      <div className="mt-8">
        <AuthForm mode="login" redirectTo={redirectTo} />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Vera? <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/signup?next=${encodeURIComponent(redirectTo)}`}>Create an account</Link>
      </p>
    </div>
  );
}

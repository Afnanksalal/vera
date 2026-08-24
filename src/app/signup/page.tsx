import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/http";
import { safeRedirectPath } from "@/server/navigation";

export const metadata: Metadata = { title: "Create account · Vera" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const query = await searchParams;
  const redirectTo = safeRedirectPath(query.next, "/app/settings");
  if (await currentUser()) redirect(redirectTo);
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Password must be 12–128 characters. Secrets never leave this server.
      </p>
      <div className="mt-8">
        <AuthForm mode="signup" redirectTo={redirectTo} />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/login?next=${encodeURIComponent(redirectTo)}`}>Sign in</Link>
      </p>
    </div>
  );
}

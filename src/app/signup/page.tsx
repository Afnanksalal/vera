import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/http";
import { safeRedirectPath } from "@/server/navigation";

export const metadata: Metadata = {
  title: "Create account",
  alternates: { canonical: "/signup" },
  robots: { index: false, follow: false, noarchive: true },
};
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const query = await searchParams;
  const redirectTo = safeRedirectPath(query.next, "/app/settings");
  if (await currentUser()) redirect(redirectTo);
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Create an account</h1>
      <div className="mt-8">
        <AuthForm mode="signup" redirectTo={redirectTo} />
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">By creating an account, you agree to the <Link href="/terms" className="font-medium text-foreground hover:underline">Terms</Link> and acknowledge the <Link href="/privacy" className="font-medium text-foreground hover:underline">Privacy Policy</Link>.</p>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/login?next=${encodeURIComponent(redirectTo)}`}>Sign in</Link>
      </p>
    </div>
  );
}

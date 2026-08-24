import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { installationHasUser } from "@/server/auth";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/http";

export const metadata: Metadata = { title: "Create account · Vera" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await currentUser()) redirect("/app");
  if (installationHasUser()) redirect("/login?notice=registration_closed");
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Password must be 12–128 characters. Secrets never leave this server.
      </p>
      <div className="mt-8">
        <AuthForm mode="signup" redirectTo="/app/settings" />
      </div>
    </div>
  );
}

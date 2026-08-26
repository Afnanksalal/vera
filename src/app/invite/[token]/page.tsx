import { redirect } from "next/navigation";
import { AcceptInvitation } from "@/components/accept-invitation";
import { Panel } from "@/components/console-ui";
import { currentSession } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: PageProps<"/invite/[token]">) {
  const token = (await params).token;
  if (!(await currentSession())) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  return <div className="mx-auto w-full max-w-lg px-5 py-16"><Panel><h1 className="text-2xl font-semibold">Join a Vera organization</h1><p className="my-4 text-sm text-muted-foreground">Accepting shares the organization’s payment ledger, reports, and evidence according to the role chosen by its administrator.</p><AcceptInvitation token={token}/></Panel></div>;
}

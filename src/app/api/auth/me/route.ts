import { currentSession, handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const session = await currentSession();
    if (!session) return Response.json({ user: null }, { status: 401 });
    return Response.json({ user: { id: session.user.id, email: session.user.email, active_organization_id: session.activeOrganizationId } });
  });
}

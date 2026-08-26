import { currentSession, handle, HttpError, readJson, assertSameOriginIfCookie, requireWorkspace } from "@/server/http";
import { acceptInvitation, inviteMember, organizationAudit, organizationInvitations, organizationMembers, organizationsForUser, removeMember, renameOrganization, switchOrganization, updateMemberRole } from "@/server/organizations";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const session = await currentSession();
    if (!session) throw new HttpError(401, "Sign in to manage organizations.", "unauthorized");
    const context = await requireWorkspace("read");
    return Response.json({ current: context.access, organizations: organizationsForUser(session.user.id), members: organizationMembers(context.access.organizationId), invitations: organizationInvitations(context.access.organizationId), audit: organizationAudit(context.access.organizationId) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const session = await currentSession();
    if (!session) throw new HttpError(401, "Sign in to manage organizations.", "unauthorized");
    if (!rateLimit(`organizations:${session.user.id}`, 30, 60_000)) throw new HttpError(429, "Organization action rate limit reached.", "rate_limited");
    const body = await readJson(req, 16_384) as { action?: string; organization_id?: string; name?: string; email?: string; role?: string; member_user_id?: string; token?: string };
    if (body.action === "switch") return Response.json({ current: switchOrganization(session.sessionId, session.user.id, String(body.organization_id ?? "")) });
    if (body.action === "accept") {
      const organizationId = acceptInvitation(session.user.id, session.user.email, String(body.token ?? ""));
      return Response.json({ current: switchOrganization(session.sessionId, session.user.id, organizationId) });
    }
    const context = await requireWorkspace("manage_members");
    if (body.action === "rename") { renameOrganization(context.access, session.user.id, body.name); return Response.json({ ok: true }); }
    if (body.action === "invite") return Response.json(inviteMember(context.access, session.user.id, body.email, body.role), { status: 201 });
    if (body.action === "role") { updateMemberRole(context.access, session.user.id, String(body.member_user_id ?? ""), body.role); return Response.json({ ok: true }); }
    if (body.action === "remove") { removeMember(context.access, session.user.id, String(body.member_user_id ?? "")); return Response.json({ ok: true }); }
    throw new HttpError(400, "Unknown organization action.", "invalid_action");
  });
}

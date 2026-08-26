import type Database from "better-sqlite3";
import { getDb, nowMs } from "./db";
import { randomId, randomToken, tokenHash } from "./crypto";
import { normalizeEmail } from "./policy";

export type OrganizationRole = "owner" | "admin" | "operator" | "auditor" | "viewer" | "integration";
export type WorkspacePermission = "read" | "operate" | "review" | "manage_integrations" | "manage_members";
export type WorkspaceAccess = {
  organizationId: string;
  organizationName: string;
  dataOwnerUserId: string;
  role: OrganizationRole;
};

const PERMISSIONS: Record<OrganizationRole, readonly WorkspacePermission[]> = {
  owner: ["read", "operate", "review", "manage_integrations", "manage_members"],
  admin: ["read", "operate", "review", "manage_integrations", "manage_members"],
  operator: ["read", "operate"],
  auditor: ["read", "review"],
  viewer: ["read"],
  integration: ["read", "operate"],
};

export function can(role: OrganizationRole, permission: WorkspacePermission): boolean { return PERMISSIONS[role].includes(permission); }

export function personalOrganizationId(userId: string): string { return `org_${userId.replace(/^usr_/, "")}`; }

export function createPersonalOrganization(userId: string, email: string, db: Database.Database = getDb()): string {
  const id = personalOrganizationId(userId);
  const namePart = email.split("@", 1)[0].replace(/[^a-z0-9 _-]/gi, " ").trim() || "My";
  const now = nowMs();
  db.prepare("INSERT INTO organizations (id, name, data_owner_user_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, `${namePart}'s workspace`, userId, userId, now, now);
  db.prepare("INSERT INTO organization_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(id, userId, now);
  return id;
}

export function workspaceForUser(userId: string, preferred?: string | null): WorkspaceAccess | null {
  const row = getDb().prepare(
    `SELECT o.id AS organization_id, o.name, o.data_owner_user_id, m.role
     FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ?
     ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, m.created_at ASC LIMIT 1`
  ).get(userId, preferred ?? "") as { organization_id: string; name: string; data_owner_user_id: string; role: Exclude<OrganizationRole, "integration"> } | undefined;
  return row ? { organizationId: row.organization_id, organizationName: row.name, dataOwnerUserId: row.data_owner_user_id, role: row.role } : null;
}

export function organizationsForUser(userId: string) {
  return getDb().prepare(
    `SELECT o.id, o.name, o.data_owner_user_id, m.role, m.created_at
     FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ? ORDER BY m.created_at ASC`
  ).all(userId) as { id: string; name: string; data_owner_user_id: string; role: Exclude<OrganizationRole, "integration">; created_at: number }[];
}

export function switchOrganization(sessionId: string, userId: string, organizationId: string): WorkspaceAccess {
  const access = workspaceForUser(userId, organizationId);
  if (!access || access.organizationId !== organizationId) throw Object.assign(new Error("You are not a member of that organization."), { code: "forbidden" });
  getDb().prepare("UPDATE sessions SET active_organization_id = ? WHERE id = ? AND user_id = ?").run(organizationId, sessionId, userId);
  return access;
}

function audit(organizationId: string, actorUserId: string | null, action: string, detail?: string, db: Database.Database = getDb()) {
  db.prepare("INSERT INTO organization_audit_log (id, organization_id, actor_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomId("orglog"), organizationId, actorUserId, action, detail?.slice(0, 500) ?? null, nowMs());
}

export function renameOrganization(access: WorkspaceAccess, actorUserId: string, rawName: unknown): void {
  if (!can(access.role, "manage_members")) throw Object.assign(new Error("You cannot manage this organization."), { code: "forbidden" });
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name.length < 2 || name.length > 80) throw Object.assign(new Error("Organization name must be 2–80 characters."), { code: "invalid_name" });
  getDb().prepare("UPDATE organizations SET name = ?, updated_at = ? WHERE id = ?").run(name, nowMs(), access.organizationId);
  audit(access.organizationId, actorUserId, "organization.renamed", name);
}

export function organizationMembers(organizationId: string) {
  return getDb().prepare(
    `SELECT u.id, u.email, m.role, m.created_at FROM organization_memberships m
     JOIN users u ON u.id = m.user_id WHERE m.organization_id = ? ORDER BY m.created_at ASC`
  ).all(organizationId) as { id: string; email: string; role: Exclude<OrganizationRole, "integration">; created_at: number }[];
}

export function organizationInvitations(organizationId: string) {
  return getDb().prepare("SELECT id, email, role, expires_at, accepted_at, created_at FROM organization_invitations WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50").all(organizationId) as { id: string; email: string; role: string; expires_at: number; accepted_at: number | null; created_at: number }[];
}

export function inviteMember(access: WorkspaceAccess, actorUserId: string, rawEmail: unknown, rawRole: unknown): { invitationId: string; token: string } {
  if (!can(access.role, "manage_members")) throw Object.assign(new Error("You cannot invite organization members."), { code: "forbidden" });
  const email = normalizeEmail(String(rawEmail ?? ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("Enter a valid invitation email."), { code: "invalid_email" });
  const role = String(rawRole ?? "viewer") as OrganizationRole;
  if (!["admin", "operator", "auditor", "viewer"].includes(role)) throw Object.assign(new Error("Invitation role is invalid."), { code: "invalid_role" });
  const existing = getDb().prepare("SELECT 1 FROM organization_memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = ? AND u.email = ?").get(access.organizationId, email);
  if (existing) throw Object.assign(new Error("That account is already a member."), { code: "already_member" });
  const token = randomToken(32); const id = randomId("inv"); const now = nowMs();
  getDb().prepare("DELETE FROM organization_invitations WHERE organization_id = ? AND email = ? AND accepted_at IS NULL").run(access.organizationId, email);
  getDb().prepare("INSERT INTO organization_invitations (id, organization_id, email, role, token_hash, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, access.organizationId, email, role, tokenHash(token), actorUserId, now + 7 * 24 * 60 * 60_000, now);
  audit(access.organizationId, actorUserId, "member.invited", `${email}:${role}`);
  return { invitationId: id, token };
}

export function acceptInvitation(userId: string, userEmail: string, token: string): string {
  const db = getDb();
  return db.transaction(() => {
    const row = db.prepare("SELECT id, organization_id, email, role, expires_at, accepted_at FROM organization_invitations WHERE token_hash = ?").get(tokenHash(token)) as { id: string; organization_id: string; email: string; role: string; expires_at: number; accepted_at: number | null } | undefined;
    if (!row || row.accepted_at || row.expires_at <= nowMs()) throw Object.assign(new Error("Invitation is invalid or expired."), { code: "invalid_invitation" });
    if (normalizeEmail(userEmail) !== row.email) throw Object.assign(new Error("Sign in with the email address that was invited."), { code: "invitation_email_mismatch" });
    db.prepare("INSERT OR IGNORE INTO organization_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(row.organization_id, userId, row.role, nowMs());
    db.prepare("UPDATE organization_invitations SET accepted_at = ? WHERE id = ?").run(nowMs(), row.id);
    audit(row.organization_id, userId, "member.joined", row.role, db);
    return row.organization_id;
  })();
}

export function updateMemberRole(access: WorkspaceAccess, actorUserId: string, memberUserId: string, rawRole: unknown): void {
  if (!can(access.role, "manage_members")) throw Object.assign(new Error("You cannot manage organization members."), { code: "forbidden" });
  const role = String(rawRole) as OrganizationRole;
  if (!["admin", "operator", "auditor", "viewer"].includes(role)) throw Object.assign(new Error("Member role is invalid."), { code: "invalid_role" });
  const target = getDb().prepare("SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ?").get(access.organizationId, memberUserId) as { role: string } | undefined;
  if (!target || target.role === "owner") throw Object.assign(new Error("The organization owner role cannot be changed."), { code: "forbidden" });
  getDb().prepare("UPDATE organization_memberships SET role = ? WHERE organization_id = ? AND user_id = ?").run(role, access.organizationId, memberUserId);
  audit(access.organizationId, actorUserId, "member.role_changed", `${memberUserId}:${role}`);
}

export function removeMember(access: WorkspaceAccess, actorUserId: string, memberUserId: string): void {
  if (!can(access.role, "manage_members")) throw Object.assign(new Error("You cannot manage organization members."), { code: "forbidden" });
  const target = getDb().prepare("SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ?").get(access.organizationId, memberUserId) as { role: string } | undefined;
  if (!target || target.role === "owner") throw Object.assign(new Error("The organization owner cannot be removed."), { code: "forbidden" });
  getDb().prepare("DELETE FROM organization_memberships WHERE organization_id = ? AND user_id = ?").run(access.organizationId, memberUserId);
  getDb().prepare("UPDATE sessions SET active_organization_id = NULL WHERE user_id = ? AND active_organization_id = ?").run(memberUserId, access.organizationId);
  audit(access.organizationId, actorUserId, "member.removed", memberUserId);
}

export function organizationAudit(organizationId: string) {
  return getDb().prepare("SELECT id, actor_user_id, action, detail, created_at FROM organization_audit_log WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50").all(organizationId) as { id: string; actor_user_id: string | null; action: string; detail: string | null; created_at: number }[];
}

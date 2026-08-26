"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";
import type { OrganizationRole, WorkspaceAccess } from "@/server/organizations";

type Organization = { id: string; name: string; role: Exclude<OrganizationRole, "integration"> };
type Member = { id: string; email: string; role: Exclude<OrganizationRole, "integration">; created_at: number };
type Invitation = { id: string; email: string; role: string; expires_at: number; accepted_at: number | null };
type Audit = { id: string; action: string; detail: string | null; created_at: number };

export function OrganizationManager({ current, organizations, members, invitations, audit, publicUrl, actorUserId }: { current: WorkspaceAccess; organizations: Organization[]; members: Member[]; invitations: Invitation[]; audit: Audit[]; publicUrl: string; actorUserId: string }) {
  const router = useRouter();
  const [name, setName] = useState(current.organizationName);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [message, setMessage] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const manageable = current.role === "owner" || current.role === "admin";
  async function action(body: Record<string, unknown>) {
    setMessage(null);
    const response = await fetch("/api/v1/organizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string; token?: string };
    if (!response.ok) { setMessage(data.error || "Organization action failed."); return data; }
    router.refresh(); return data;
  }
  return <div className="grid gap-6">
    {organizations.length > 1 ? <Field label="Active workspace"><Select value={current.organizationId} onValueChange={async (value) => { if (!value) return; await action({ action: "switch", organization_id: value }); router.push("/app"); router.refresh(); }}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent>{organizations.map((organization) => <SelectItem key={organization.id} value={organization.id}>{organization.name} · {organization.role}</SelectItem>)}</SelectContent></Select></Field> : null}
    <div className="grid max-w-lg gap-3"><Field label="Organization name"><Input disabled={!manageable} value={name} minLength={2} maxLength={80} onChange={(event) => setName(event.target.value)} /></Field>{manageable ? <Button type="button" className="w-fit" onClick={() => action({ action: "rename", name })}>Save name</Button> : <p className="text-xs text-muted-foreground">Owner or admin access required.</p>}</div>
    {manageable ? <div className="grid max-w-lg gap-3 border-t border-border pt-5"><h3 className="font-semibold">Invite member</h3><Field label="Email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field><Field label="Role"><Select value={role} onValueChange={(value) => value && setRole(value)}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent>{["admin", "operator", "auditor", "viewer"].map((item) => <SelectItem key={item} value={item}><span className="capitalize">{item}</span></SelectItem>)}</SelectContent></Select></Field><Button type="button" className="w-fit" onClick={async () => { const data = await action({ action: "invite", email, role }); if (data.token) { const base = publicUrl.replace(/\/$/, "") || location.origin; setInviteLink(`${base}/invite/${data.token}`); setEmail(""); } }}>Create invitation</Button>{inviteLink ? <div className="rounded-lg bg-muted p-3 text-xs"><p className="font-medium">Invitation link</p><p className="mt-1 break-all font-mono">{inviteLink}</p><p className="mt-2 text-muted-foreground">Email-bound · expires in 7 days</p></div> : null}</div> : null}
    <div className="border-t border-border pt-5"><h3 className="font-semibold">Members</h3><div className="mt-3 grid gap-2">{members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{member.email}{member.id === actorUserId ? " · you" : ""}</p><p className="text-xs capitalize text-muted-foreground">{member.role}</p></div>{manageable && member.role !== "owner" ? <div className="flex gap-2"><Select value={member.role} onValueChange={(value) => value && void action({ action: "role", member_user_id: member.id, role: value })}><SelectTrigger aria-label={`Role for ${member.email}`} size="sm" className="w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["admin", "operator", "auditor", "viewer"].map((item) => <SelectItem key={item} value={item}><span className="capitalize">{item}</span></SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => action({ action: "remove", member_user_id: member.id })}>Remove</Button></div> : null}</div>)}</div></div>
    {invitations.some((item) => !item.accepted_at) ? <Disclosure title="Pending invitations"> <div className="grid gap-2">{invitations.filter((item) => !item.accepted_at).map((item) => <div key={item.id} className="rounded-lg border border-border px-3 py-2 text-xs"><span>{item.email}</span><span className="ml-2 capitalize text-muted-foreground">{item.role}</span></div>)}</div></Disclosure> : null}
    <Disclosure title="Organization audit log" className="border-t border-border pt-5"><div className="grid gap-2">{audit.length ? audit.map((item)=><div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"><span><span className="font-medium">{item.action.replaceAll(".", " ")}</span>{item.detail ? ` · ${item.detail}` : ""}</span><time className="text-muted-foreground">{new Date(item.created_at).toLocaleString("en-IN")}</time></div>) : <p className="text-xs text-muted-foreground">No organization changes recorded yet.</p>}</div></Disclosure>
    {message ? <Notice>{message}</Notice> : null}
  </div>;
}

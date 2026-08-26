import { AiSettingsForm, ApiKeyForm, PasswordForm, RazorpayForm, RevokeKeyButton, SyncButton, SystemSettingsForm } from "@/components/settings-forms";
import { isOwner, listApiKeys, listSessions } from "@/server/auth";
import { currentSession, currentWorkspace } from "@/server/http";
import { SessionManager } from "@/components/account-actions";
import { PageHeader, Panel } from "@/components/console-ui";
import { razorpayPublic } from "@/server/razorpay";
import { aiSettingsPublic, getSystemSettings } from "@/server/settings";
import { webhookQueueStatus } from "@/server/webhooks";
import { ChatIntegrationForm } from "@/components/chat-integration-form";
import { chatIntegrationPublic, commandEndpoint } from "@/server/chat-integrations";
import { integrationOperations } from "@/server/chat-integrations";
import { IntegrationOperationsPanel } from "@/components/integration-operations";
import { BackupManager } from "@/components/backup-manager";
import { backupHistory } from "@/server/backups";
import { operationalStatus } from "@/server/operations";
import { can, organizationAudit, organizationInvitations, organizationMembers, organizationsForUser } from "@/server/organizations";
import { OrganizationManager } from "@/components/organization-manager";
import { keyRotationStatus } from "@/server/security";
import { KeyRotation } from "@/components/key-rotation";
import { bankFeedPublic } from "@/server/bank-feed";
import { BankFeedForm } from "@/components/bank-feed-form";
import { nowMs } from "@/server/db";
import { Disclosure } from "@/components/ui/disclosure";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await currentSession(); if (!session) return null;
  const user = session.user;
  const workspace = await currentWorkspace(); if (!workspace) return null;
  const workspaceId = workspace.access.dataOwnerUserId;
  const manageIntegrations = can(workspace.access.role, "manage_integrations");
  const keys = manageIntegrations ? listApiKeys(workspaceId) : [];
  const sessions = listSessions(user.id, session.sessionId);
  const rzp = razorpayPublic(workspaceId);
  const system = getSystemSettings();
  const ai = aiSettingsPublic(workspaceId);
  const webhookQueue = webhookQueueStatus(workspaceId);
  const owner = isOwner(user.id);
  const slack = chatIntegrationPublic(workspaceId, "slack");
  const discord = chatIntegrationPublic(workspaceId, "discord");
  const operations = integrationOperations(workspaceId);
  const backups = owner ? backupHistory(user.id) : [];
  const status = owner ? operationalStatus(workspaceId) : null;
  const organizations = organizationsForUser(user.id);
  const members = organizationMembers(workspace.access.organizationId);
  const invitations = organizationInvitations(workspace.access.organizationId).filter((item) => item.accepted_at || item.expires_at > nowMs());
  const audit = organizationAudit(workspace.access.organizationId);
  const bankFeed = bankFeedPublic(workspaceId);
  const rotation = owner ? keyRotationStatus(user.id) : null;
  return <div className="grid gap-8">
    <PageHeader title="Settings" />
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2 text-sm">{[["#organization","Organization"],["#razorpay","Payments"],["#ai","AI"],["#chat","Chat"],["#integrations","API keys"],["#account","Account"],...(owner ? [["#installation","Installation"]] : [])].map(([href,label]) => <a key={href} href={href} className="rounded-full border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{label}</a>)}</nav>

    <Panel id="organization"><h2 className="mb-6 text-lg font-semibold">Organization</h2><OrganizationManager current={workspace.access} organizations={organizations} members={members} invitations={invitations} audit={audit} publicUrl={system.public_url} actorUserId={user.id}/></Panel>

    <Panel id="razorpay"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Razorpay</h2><span className={rzp.configured ? "rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok" : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}>{rzp.configured ? `Connected · ${rzp.mode}` : "Not connected"}</span></div>{manageIntegrations ? <><RazorpayForm webhookUrl={rzp.webhook_url} configured={rzp.configured} initialKeyId={rzp.key_id ?? ""} hasWebhookSecret={rzp.has_webhook_secret}/>{webhookQueue.pending || webhookQueue.failed ? <p className="mt-4 text-sm text-muted-foreground">Webhooks · {webhookQueue.pending} queued · {webhookQueue.failed} failed</p> : null}{rzp.configured ? <><div className="mt-6 border-t border-border pt-5"><h3 className="mb-3 text-sm font-medium">Payment sync</h3><SyncButton /></div><div className="mt-6 border-t border-border pt-5"><h3 className="mb-4 text-sm font-medium">Bank feed</h3><BankFeedForm feed={bankFeed}/></div></> : null}</> : <p className="text-sm text-muted-foreground">Not available for this role.</p>}</Panel>

    <Panel id="ai"><h2 className="mb-6 text-lg font-semibold">AI investigator</h2>{manageIntegrations ? <AiSettingsForm configured={ai.configured} initialProvider={ai.provider} initialModel={ai.model} initialBaseUrl={ai.base_url}/> : <p className="text-sm text-muted-foreground">Owner or admin access required.</p>}</Panel>

    <Panel id="chat"><h2 className="mb-6 text-lg font-semibold">Slack and Discord</h2>{manageIntegrations ? <><div className="grid gap-4"><ChatIntegrationForm integration={slack} commandUrl={commandEndpoint(workspaceId, "slack")}/><ChatIntegrationForm integration={discord} commandUrl={commandEndpoint(workspaceId, "discord")}/></div><div className="mt-6 border-t border-border pt-6"><IntegrationOperationsPanel operations={operations}/></div></> : <p className="text-sm text-muted-foreground">Not available for this role.</p>}</Panel>

    <Panel id="integrations"><h2 className="mb-6 text-lg font-semibold">Integration keys</h2>{manageIntegrations ? <><ApiKeyForm />{keys.length ? <ul className="mt-5 grid gap-2">{keys.map((key) => <li key={key.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{key.name}</span><span className="font-mono text-xs text-muted-foreground">{key.prefix}…</span></span><RevokeKeyButton id={key.id}/></li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">No integration keys</p>}</> : <p className="text-sm text-muted-foreground">Not available for this role.</p>}</Panel>

    <Panel id="account"><h2 className="mb-6 text-lg font-semibold">Password</h2><PasswordForm /></Panel>
    <Panel><h2 className="mb-6 text-lg font-semibold">Sessions</h2><SessionManager sessions={sessions}/></Panel>

    {owner && status && rotation ? <Panel id="installation"><Disclosure title={<span className="block text-lg font-semibold">Installation</span>} panelClassName="mt-6 border-t border-border pt-6"><div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Database integrity</p><p className="mt-1 font-semibold capitalize">{status.database}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Schema version</p><p className="mt-1 font-semibold">{status.schema_version}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Background worker</p><p className="mt-1 font-semibold">{status.worker.healthy ? "Healthy" : "Needs attention"}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Verified backup</p><p className="mt-1 font-semibold">{status.backup.healthy ? "Current" : "Overdue"}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Failed jobs</p><p className="mt-1 font-semibold">{status.webhook.failed + status.notifications.failed}</p></div></div><SystemSettingsForm publicUrl={system.public_url} allowLive={system.allow_live_razorpay} maxIngestEvents={system.max_ingest_events}/><div className="mt-8 border-t border-border pt-6"><h3 className="mb-5 font-semibold">Recovery backups</h3><BackupManager history={backups}/></div><div className="mt-8 border-t border-border pt-6"><h3 className="mb-5 font-semibold">Master-key rotation</h3><KeyRotation ready={rotation.rotation_ready} lastRotatedAt={rotation.last_rotated_at}/></div></Disclosure></Panel> : null}
  </div>;
}

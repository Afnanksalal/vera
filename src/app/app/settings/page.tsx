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
    <PageHeader title="Settings" description="Connect payment data, manage integrations, and secure your account." />
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2 text-sm">{[["#organization","Organization"],["#razorpay","Payments"],["#ai","AI"],["#chat","Chat"],["#integrations","API keys"],["#account","Account"],...(owner ? [["#installation","Installation"]] : [])].map(([href,label]) => <a key={href} href={href} className="rounded-full border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{label}</a>)}</nav>

    <Panel id="organization"><div className="mb-6"><h2 className="text-lg font-semibold">Organization</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Share this workspace with teammates using server-enforced roles. Members see the same ledger without sharing passwords or provider credentials.</p></div><OrganizationManager current={workspace.access} organizations={organizations} members={members} invitations={invitations} audit={audit} publicUrl={system.public_url} actorUserId={user.id}/></Panel>

    <Panel id="razorpay"><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Razorpay</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Connect your account to import payments and settlement reports.</p></div><span className={rzp.configured ? "rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok" : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}>{rzp.configured ? `Connected · ${rzp.mode}` : "Not connected"}</span></div>{manageIntegrations ? <><RazorpayForm webhookUrl={rzp.webhook_url} configured={rzp.configured} initialKeyId={rzp.key_id ?? ""} hasWebhookSecret={rzp.has_webhook_secret}/>{webhookQueue.pending || webhookQueue.failed ? <p className="mt-4 text-sm text-muted-foreground">Webhook deliveries: {webhookQueue.pending} waiting, {webhookQueue.failed} failed. The background worker retries them automatically.</p> : null}{rzp.configured ? <><div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-medium">Import payments</h3><p className="mb-3 mt-1 text-sm text-muted-foreground">Choose a month to import payments and Razorpay settlement reports.</p><SyncButton /></div><div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-medium">Bank feed</h3><p className="mb-4 mt-1 text-sm text-muted-foreground">Import real RazorpayX account transactions on a schedule and match only unambiguous settlement credits.</p><BankFeedForm feed={bankFeed}/></div></> : null}</> : <p className="text-sm text-muted-foreground">Your {workspace.access.role} role can view this connection but cannot change provider credentials.</p>}</Panel>

    <Panel id="ai"><div className="mb-6"><h2 className="text-lg font-semibold">AI investigator</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Connect Vera’s investigation engine to explain payment issues and propose reconciliation findings. Every AI suggestion is independently checked against the stored evidence.</p></div>{manageIntegrations ? <AiSettingsForm configured={ai.configured} initialProvider={ai.provider} initialModel={ai.model} initialBaseUrl={ai.base_url}/> : <p className="text-sm text-muted-foreground">Configured for this workspace. Only owners and admins can replace its credentials.</p>}</Panel>

    <Panel id="chat"><div className="mb-6"><h2 className="text-lg font-semibold">Slack and Discord</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Send verified report alerts where your team works and expose read-only, signed commands. Vera shares counts and report links, never credentials or evidence files.</p></div>{manageIntegrations ? <><div className="grid gap-4"><ChatIntegrationForm integration={slack} commandUrl={commandEndpoint(workspaceId, "slack")}/><ChatIntegrationForm integration={discord} commandUrl={commandEndpoint(workspaceId, "discord")}/></div><div className="mt-6 border-t border-border pt-6"><IntegrationOperationsPanel operations={operations}/></div></> : <p className="text-sm text-muted-foreground">Only owners and admins can configure chat integrations or retry deliveries.</p>}</Panel>

    <Panel id="integrations"><div className="mb-6"><h2 className="text-lg font-semibold">Integration keys</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Create keys for services that send payment and mandate records to Vera.</p></div>{manageIntegrations ? <><ApiKeyForm />{keys.length ? <ul className="mt-5 grid gap-2">{keys.map((key) => <li key={key.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{key.name}</span><span className="font-mono text-xs text-muted-foreground">{key.prefix}…</span></span><RevokeKeyButton id={key.id}/></li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">No integration keys yet.</p>}</> : <p className="text-sm text-muted-foreground">Integration key metadata is hidden from your role.</p>}</Panel>

    <Panel id="account"><div className="mb-6"><h2 className="text-lg font-semibold">Password</h2><p className="mt-1 text-sm text-muted-foreground">Changing your password signs out every other session.</p></div><PasswordForm /></Panel>
    <Panel><div className="mb-6"><h2 className="text-lg font-semibold">Where you’re signed in</h2><p className="mt-1 text-sm text-muted-foreground">Review active browsers and sign out anything you do not recognize.</p></div><SessionManager sessions={sessions}/></Panel>

    {owner && status && rotation ? <Panel id="installation"><Disclosure title={<span><span className="block text-lg font-semibold">Advanced installation settings</span><span className="mt-1 block text-sm font-normal text-muted-foreground">Public URL, storage limits, live-payment safeguards, health, recovery, and trust-root rotation.</span></span>} panelClassName="mt-6 border-t border-border pt-6"><div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Database integrity</p><p className="mt-1 font-semibold capitalize">{status.database}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Schema version</p><p className="mt-1 font-semibold">{status.schema_version}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Background worker</p><p className="mt-1 font-semibold">{status.worker.healthy ? "Healthy" : "Needs attention"}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Verified backup</p><p className="mt-1 font-semibold">{status.backup.healthy ? "Current" : "Overdue"}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Failed jobs</p><p className="mt-1 font-semibold">{status.webhook.failed + status.notifications.failed}</p></div></div><SystemSettingsForm publicUrl={system.public_url} allowLive={system.allow_live_razorpay} maxIngestEvents={system.max_ingest_events}/><div className="mt-8 border-t border-border pt-6"><h3 className="font-semibold">Recovery backups</h3><p className="mb-5 mt-1 text-sm text-muted-foreground">Create and verify a portable recovery file without shell access or environment variables.</p><BackupManager history={backups}/></div><div className="mt-8 border-t border-border pt-6"><h3 className="font-semibold">Master-key rotation</h3><p className="mb-5 mt-1 text-sm text-muted-foreground">Rotate the installation trust root after verifying a recovery point.</p><KeyRotation ready={rotation.rotation_ready} lastRotatedAt={rotation.last_rotated_at}/></div></Disclosure></Panel> : null}
  </div>;
}

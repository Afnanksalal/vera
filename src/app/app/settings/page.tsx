import { AiSettingsForm, ApiKeyForm, PasswordForm, RazorpayForm, RevokeKeyButton, SyncButton, SystemSettingsForm } from "@/components/settings-forms";
import { isOwner, listApiKeys, listSessions } from "@/server/auth";
import { currentSession } from "@/server/http";
import { SessionManager } from "@/components/account-actions";
import { PageHeader, Panel } from "@/components/console-ui";
import { razorpayPublic } from "@/server/razorpay";
import { aiSettingsPublic, getSystemSettings } from "@/server/settings";
import { webhookQueueStatus } from "@/server/webhooks";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await currentSession(); if (!session) return null;
  const user = session.user;
  const keys = listApiKeys(user.id);
  const sessions = listSessions(user.id, session.sessionId);
  const rzp = razorpayPublic(user.id);
  const system = getSystemSettings();
  const ai = aiSettingsPublic(user.id);
  const webhookQueue = webhookQueueStatus(user.id);
  const owner = isOwner(user.id);
  return <div className="grid gap-8">
    <PageHeader title="Settings" description="Connect payment data, manage integrations, and secure your account." />
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2 text-sm">{[["#razorpay","Payments"],["#ai","AI"],["#integrations","Integrations"],["#account","Account"],...(owner ? [["#installation","Installation"]] : [])].map(([href,label]) => <a key={href} href={href} className="rounded-full border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{label}</a>)}</nav>

    <Panel id="razorpay"><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Razorpay</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Connect your account to import payments and settlement reports.</p></div><span className={rzp.configured ? "rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok" : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}>{rzp.configured ? `Connected · ${rzp.mode}` : "Not connected"}</span></div><RazorpayForm webhookUrl={rzp.webhook_url} configured={rzp.configured} initialKeyId={rzp.key_id ?? ""} hasWebhookSecret={rzp.has_webhook_secret}/>{webhookQueue.pending || webhookQueue.failed ? <p className="mt-4 text-sm text-muted-foreground">Webhook deliveries: {webhookQueue.pending} waiting, {webhookQueue.failed} failed. The next sync retries failed deliveries.</p> : null}{rzp.configured ? <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-medium">Import payments</h3><p className="mb-3 mt-1 text-sm text-muted-foreground">Choose a month to import payments and Razorpay settlement reports.</p><SyncButton /></div> : null}</Panel>

    <Panel id="ai"><div className="mb-6"><h2 className="text-lg font-semibold">AI assistance <span className="ml-1 text-sm font-normal text-muted-foreground">Optional</span></h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Let a model investigate unusual payments and suggest findings. Vera still verifies every suggestion before using it.</p></div><AiSettingsForm configured={ai.configured} initialProvider={ai.provider} initialModel={ai.model} initialBaseUrl={ai.base_url}/></Panel>

    <Panel id="integrations"><div className="mb-6"><h2 className="text-lg font-semibold">Integration keys</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Create keys for services that send payment and mandate records to Vera.</p></div><ApiKeyForm />{keys.length ? <ul className="mt-5 grid gap-2">{keys.map((key) => <li key={key.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{key.name}</span><span className="font-mono text-xs text-muted-foreground">{key.prefix}…</span></span><RevokeKeyButton id={key.id}/></li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">No integration keys yet.</p>}</Panel>

    <Panel id="account"><div className="mb-6"><h2 className="text-lg font-semibold">Password</h2><p className="mt-1 text-sm text-muted-foreground">Changing your password signs out every other session.</p></div><PasswordForm /></Panel>
    <Panel><div className="mb-6"><h2 className="text-lg font-semibold">Where you’re signed in</h2><p className="mt-1 text-sm text-muted-foreground">Review active browsers and sign out anything you do not recognize.</p></div><SessionManager sessions={sessions}/></Panel>

    {owner ? <Panel id="installation"><details><summary className="cursor-pointer list-none"><h2 className="inline text-lg font-semibold">Advanced installation settings</h2><p className="mt-1 text-sm text-muted-foreground">Public URL, storage limits, and live-payment safeguards for this self-hosted installation.</p></summary><div className="mt-6 border-t border-border pt-6"><SystemSettingsForm publicUrl={system.public_url} allowLive={system.allow_live_razorpay} maxIngestEvents={system.max_ingest_events}/></div></details></Panel> : null}
  </div>;
}

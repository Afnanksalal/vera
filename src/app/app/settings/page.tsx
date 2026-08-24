import { AiSettingsForm, ApiKeyForm, PasswordForm, RazorpayForm, RevokeKeyButton, SyncButton, SystemSettingsForm } from "@/components/settings-forms";
import { isOwner, listApiKeys, listSessions } from "@/server/auth";
import { currentSession } from "@/server/http";
import { SessionManager } from "@/components/account-actions";
import { razorpayPublic } from "@/server/razorpay";
import { aiSettingsPublic, getSystemSettings } from "@/server/settings";
import { webhookQueueStatus } from "@/server/webhooks";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await currentSession();
  if (!session) return null;
  const user = session.user;
  const keys = listApiKeys(user.id);
  const sessions = listSessions(user.id, session.sessionId);
  const rzp = razorpayPublic(user.id);
  const system = getSystemSettings();
  const ai = aiSettingsPublic(user.id);
  const webhookQueue = webhookQueueStatus(user.id);

  return (
    <div className="grid gap-10">
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Account security</h2>
        <p className="text-sm text-muted-foreground">Changing the owner password invalidates every other active session.</p>
        <PasswordForm />
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Active sessions</h2>
        <p className="text-sm text-muted-foreground">Review signed-in browsers and revoke anything you do not recognize. Vera stores a derived client label and masked IP hint, never the raw session token.</p>
        <SessionManager sessions={sessions} />
      </section>
      {isOwner(user.id) ? <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Installation</h2>
        <p className="text-sm text-muted-foreground">Configure the canonical URL and production safeguards here. Vera stores configuration in its persistent database; no environment file is used.</p>
        <SystemSettingsForm publicUrl={system.public_url} allowLive={system.allow_live_razorpay} maxIngestEvents={system.max_ingest_events} />
      </section> : null}
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">AI investigator</h2>
        <p className="text-sm text-muted-foreground">Optional. The key is encrypted with this installation’s master key. Model output can propose findings but cannot mutate the ledger.</p>
        <AiSettingsForm configured={ai.configured} initialProvider={ai.provider} initialModel={ai.model} initialBaseUrl={ai.base_url} />
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Integration API keys</h2>
        <p className="text-sm text-muted-foreground">
          Keys start with <code>vera_</code>. Vera stores only a peppered hash. Use them for server-to-server ingestion and automation.
        </p>
        <ApiKeyForm />
        <ul className="grid gap-2">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-mono">
                {key.name} · {key.prefix}…
              </span>
              <RevokeKeyButton id={key.id} />
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Razorpay</h2>
        <p className="text-sm text-muted-foreground">
          {rzp.configured
            ? `Connected as ${rzp.key_id} (${rzp.mode}).`
            : "Paste keys from the Razorpay dashboard. Test mode is accepted by default; live mode requires explicit installation opt-in above."}
        </p>
        <RazorpayForm
          webhookUrl={rzp.webhook_url}
          configured={rzp.configured}
          initialKeyId={rzp.key_id ?? ""}
          hasWebhookSecret={rzp.has_webhook_secret}
        />
        {webhookQueue.pending || webhookQueue.failed ? (
          <p className="text-sm text-muted-foreground">
            Webhook queue: {webhookQueue.pending} pending, {webhookQueue.failed} failed. Sync retries failed deliveries up to five times.
          </p>
        ) : null}
        {rzp.configured ? <SyncButton /> : null}
        {rzp.configured ? <p className="text-xs text-muted-foreground">The selected month imports official Razorpay settlement recon. A UTR is retained as processor provenance; Vera still requires separately ingested bank evidence for the Banked claim.</p> : null}
      </section>
    </div>
  );
}

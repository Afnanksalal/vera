"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import type { ChatIntegrationPublic } from "@/server/chat-integrations";

export function ChatIntegrationForm({ integration, commandUrl }: { integration: ChatIntegrationPublic; commandUrl: string }) {
  const router = useRouter();
  const provider = integration.provider;
  const label = provider === "slack" ? "Slack" : "Discord";
  const [webhookUrl, setWebhookUrl] = useState("");
  const [commandCredential, setCommandCredential] = useState("");
  const [applicationId, setApplicationId] = useState(integration.application_id ?? "");
  const [botToken, setBotToken] = useState("");
  const [enabled, setEnabled] = useState(integration.configured ? integration.enabled : true);
  const [notifyReports, setNotifyReports] = useState(integration.notify_reports);
  const [notifyIssues, setNotifyIssues] = useState(integration.notify_issues);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function request(method: "PUT" | "POST" | "DELETE", action?: "test" | "register_commands") {
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/v1/chat-integrations/${provider}`, {
      method,
      headers: method !== "DELETE" ? { "content-type": "application/json" } : undefined,
      body: method === "PUT" ? JSON.stringify({
        webhook_url: webhookUrl,
        enabled,
        notify_reports: notifyReports,
        notify_issues: notifyIssues,
        ...(provider === "slack" ? { signing_secret: commandCredential } : { command_public_key: commandCredential }),
        ...(provider === "discord" ? { application_id: applicationId, bot_token: botToken } : {}),
      }) : method === "POST" ? JSON.stringify({ action }) : undefined,
    });
    const data = response.status === 204 ? {} : await response.json() as { error?: string };
    setPending(false);
    if (!response.ok) return setMessage(data.error || `${label} request failed.`);
    if (method === "PUT") {
      setWebhookUrl("");
      setCommandCredential("");
      setBotToken("");
      setMessage(`${label} settings encrypted and saved.`);
    } else if (method === "POST") {
      setMessage(action === "register_commands" ? "Discord slash commands registered." : `Test notification delivered to ${label}.`);
    } else {
      setMessage(`${label} disconnected and queued deliveries removed.`);
    }
    router.refresh();
  }

  return <form className="rounded-xl border border-border p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void request("PUT"); }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold">{label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{provider === "slack" ? "Notify a Slack channel and answer signed slash commands." : "Notify a Discord channel and answer signed application commands."}</p>
      </div>
      <span className={integration.configured && integration.enabled ? "rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok" : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}>
        {integration.configured ? (integration.enabled ? "Connected" : "Paused") : "Not connected"}
      </span>
    </div>

    <div className="mt-5 grid max-w-xl gap-3">
      <Field label={integration.configured ? `Replace ${label} webhook URL (leave unchanged to keep current)` : `${label} webhook URL`}>
        <Input type="password" required={!integration.configured} autoComplete="new-password" value={webhookUrl} placeholder={integration.configured ? "••••••••••••••••" : provider === "slack" ? "https://hooks.slack.com/services/…" : "https://discord.com/api/webhooks/…"} onChange={(event) => setWebhookUrl(event.target.value)} />
      </Field>
      <Field label={provider === "slack" ? (integration.commands_configured ? "Replace Slack signing secret (leave unchanged to keep current)" : "Slack signing secret (optional)") : (integration.commands_configured ? "Replace Discord application public key (leave unchanged to keep current)" : "Discord application public key (optional)")}>
        <Input type={provider === "slack" ? "password" : "text"} autoComplete="new-password" value={commandCredential} placeholder={integration.commands_configured ? "••••••••••••••••" : provider === "slack" ? "Enables verified /vera commands" : "64-character public key"} onChange={(event) => setCommandCredential(event.target.value)} className={provider === "discord" ? "font-mono text-xs" : undefined} />
      </Field>
      {provider === "discord" ? <>
        <Field label="Discord application ID"><Input inputMode="numeric" pattern="[0-9]{16,22}" value={applicationId} placeholder="Application ID" onChange={(event) => setApplicationId(event.target.value)} /></Field>
        <Field label={integration.application_id ? "Replace Discord bot token (leave unchanged to keep current)" : "Discord bot token (optional)"}><Input type="password" autoComplete="new-password" value={botToken} placeholder={integration.application_id ? "••••••••••••••••" : "Required only for automatic command registration"} onChange={(event) => setBotToken(event.target.value)} /></Field>
      </> : null}
      <div className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">Command endpoint</p>
        <p className="mt-1 break-all font-mono">{commandUrl || "Set the installation Public URL to generate a public command endpoint."}</p>
        <p className="mt-2">{provider === "slack" ? "Use this as the Request URL for a /vera Slack command. Vera verifies Slack’s signature before returning read-only issues or payment summaries." : "Use this as the Discord Interactions Endpoint URL. Create a vera command with issues and payment subcommands; Vera verifies every Ed25519-signed interaction."}</p>
      </div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-1"/><span><span className="font-medium">Enable delivery</span><span className="block text-xs text-muted-foreground">Pause notifications and commands without deleting encrypted configuration.</span></span></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={notifyReports} onChange={(event) => setNotifyReports(event.target.checked)} className="mt-1"/><span><span className="font-medium">Clean reports</span><span className="block text-xs text-muted-foreground">Notify when every available check completes without an evidence issue.</span></span></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={notifyIssues} onChange={(event) => setNotifyIssues(event.target.checked)} className="mt-1"/><span><span className="font-medium">Reports needing attention</span><span className="block text-xs text-muted-foreground">Notify when a signed report contains missing or conflicting evidence.</span></span></label>
      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" disabled={pending}>{integration.configured ? `Update ${label}` : `Connect ${label}`}</Button>
        {integration.configured ? <Button type="button" variant="outline" disabled={pending || !integration.enabled} onClick={() => request("POST", "test")}>Send test</Button> : null}
        {provider === "discord" && integration.configured ? <Button type="button" variant="outline" disabled={pending || !integration.commands_configured || !integration.application_id} onClick={() => request("POST", "register_commands")}>{integration.commands_registered_at ? "Register commands again" : "Register commands"}</Button> : null}
        {integration.configured ? <Button type="button" variant="outline" disabled={pending} onClick={() => request("DELETE")}>Disconnect</Button> : null}
      </div>
      {integration.configured ? <p className="text-xs text-muted-foreground">{integration.pending} queued · {integration.failed} failed{integration.last_delivery_at ? ` · Last delivered ${new Date(integration.last_delivery_at).toLocaleString()}` : ""}</p> : null}
      {provider === "discord" && integration.commands_registered_at ? <p className="text-xs text-muted-foreground">Commands registered {new Date(integration.commands_registered_at).toLocaleString()}.</p> : null}
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  </form>;
}

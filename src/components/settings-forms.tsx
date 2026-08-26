"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";

export function PasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return <form className="grid max-w-lg gap-3" onSubmit={async (event) => {
    event.preventDefault();
    setMessage(null);
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) return setMessage(body.error || "Password change failed");
    setCurrentPassword("");
    setNewPassword("");
    setMessage("Password changed. Other sessions were signed out.");
    router.refresh();
  }}>
    <Field label="Current password"><Input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field>
    <Field label="New password"><Input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field>
    <Button type="submit" className="h-10 w-fit px-4">Change password</Button>
    {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
  </form>;
}

export function SystemSettingsForm({ publicUrl, allowLive, maxIngestEvents }: { publicUrl: string; allowLive: boolean; maxIngestEvents: number }) {
  const [url, setUrl] = useState(publicUrl);
  const [live, setLive] = useState(allowLive);
  const [message, setMessage] = useState<string | null>(null);
  const [capacity, setCapacity] = useState(String(maxIngestEvents));
  return <form className="grid max-w-lg gap-3" onSubmit={async (event) => {
    event.preventDefault();
    const res = await fetch("/api/v1/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: "system", public_url: url, allow_live_razorpay: live, max_ingest_events: Number(capacity) }) });
    const data = (await res.json()) as { error?: string };
    setMessage(res.ok ? "Installation settings saved." : data.error || "Save failed");
  }}>
    <Field label="Public URL"><Input type="url" placeholder="https://vera.example.com" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
    <Field label="Maximum stored events per account"><Input required type="number" min={1000} max={1000000} step={1000} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
    <CheckboxField checked={live} onCheckedChange={setLive} label="Allow Razorpay live keys" description="Test mode remains the default. Enable this only after TLS, backups, and webhook verification are in place." />
    <Button type="submit" className="h-10 w-fit px-4">Save installation settings</Button>
    {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
  </form>;
}

export function AiSettingsForm({ configured, initialProvider, initialModel, initialBaseUrl }: { configured: boolean; initialProvider: "anthropic" | "openai" | null; initialModel: string | null; initialBaseUrl: string | null }) {
  const router = useRouter();
  const [provider, setProvider] = useState<"anthropic" | "openai">(initialProvider ?? "anthropic");
  const [model, setModel] = useState(initialModel ?? "");
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? "https://api.anthropic.com");
  const [apiKey, setApiKey] = useState("");
  const [isConfigured, setIsConfigured] = useState(configured);
  const [message, setMessage] = useState<string | null>(null);
  function changeProvider(value: "anthropic" | "openai") {
    setProvider(value);
    setModel("");
    setBaseUrl(value === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1");
  }
  return <form className="grid max-w-lg gap-3" onSubmit={async (event) => {
    event.preventDefault();
    const res = await fetch("/api/v1/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: "ai", provider, model, base_url: baseUrl, api_key: apiKey }) });
    const data = (await res.json()) as { error?: string };
    setMessage(res.ok ? "AI credentials encrypted and saved." : data.error || "Save failed");
    if (res.ok) {
      setApiKey("");
      setIsConfigured(true);
      router.refresh();
    }
  }}>
    <div className="grid gap-1.5 text-sm">
      <label htmlFor="ai-provider" className="font-medium">Provider</label>
      <Select value={provider} onValueChange={(value) => typeof value === "string" && changeProvider(value as "anthropic" | "openai")}>
        <SelectTrigger id="ai-provider" className="h-10">
          <SelectValue>
            {(value: "anthropic" | "openai" | null) => value === "openai" ? "OpenAI-compatible" : "Anthropic"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="anthropic" label="Anthropic">Anthropic</SelectItem>
          <SelectItem value="openai" label="OpenAI-compatible">OpenAI-compatible</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <Field label="Model"><Input required placeholder="Provider model ID" value={model} onChange={(e) => setModel(e.target.value)} /></Field>
    <Field label="Base URL"><Input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
    <Field label={isConfigured ? "Replace API key (leave unchanged to keep current)" : "API key"}><Input type="password" value={apiKey} placeholder={isConfigured ? "••••••••••••••••" : undefined} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" /></Field>
    <div className="flex gap-3"><Button type="submit" className="h-10 w-fit px-4">{isConfigured ? "Update AI settings" : "Connect AI"}</Button>{isConfigured ? <Button type="button" variant="outline" onClick={async () => { await fetch("/api/v1/settings", { method: "DELETE" }); location.reload(); }}>Disconnect</Button> : null}</div>
    {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
  </form>;
}

export function ApiKeyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid max-w-md gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const res = await fetch("/api/v1/keys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = (await res.json()) as { secret?: string; error?: string };
        if (!res.ok) {
          setError(data.error || "Could not create key");
          return;
        }
        setSecret(data.secret ?? null);
        router.refresh();
      }}
    >
      <Field label="Integration name">
        <Input required maxLength={80} placeholder="Accounting sync" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" className="h-10 w-fit px-4">
        Create integration key
      </Button>
      {secret ? (
        <p className="rounded-lg bg-muted p-3 font-mono text-xs break-all">
          Copy now. Vera will not show this again.
          <br />
          {secret}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

export function RazorpayForm({ webhookUrl, configured, initialKeyId, hasWebhookSecret }: { webhookUrl: string; configured: boolean; initialKeyId: string; hasWebhookSecret: boolean }) {
  const router = useRouter();
  const [keyId, setKeyId] = useState(initialKeyId);
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isConfigured, setIsConfigured] = useState(configured);
  const [hasStoredWebhookSecret, setHasStoredWebhookSecret] = useState(hasWebhookSecret);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="grid max-w-lg gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/v1/razorpay", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key_id: keyId, key_secret: keySecret, webhook_secret: webhookSecret }),
        });
        const data = (await res.json()) as { error?: string };
        setMessage(res.ok ? "Saved. Secrets are encrypted at rest." : data.error || "Save failed");
        if (res.ok) {
          setIsConfigured(true);
          setHasStoredWebhookSecret(hasStoredWebhookSecret || Boolean(webhookSecret));
          setKeySecret("");
          setWebhookSecret("");
          router.refresh();
        }
      }}
    >
      <Field label="Key ID (rzp_test_… or rzp_live_…)">
        <Input value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" />
      </Field>
      <Field label={isConfigured ? "Replace key secret (leave unchanged to keep current)" : "Key secret"}>
        <Input type="password" required={!isConfigured} value={keySecret} placeholder={isConfigured ? "••••••••••••••••" : undefined} onChange={(e) => setKeySecret(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label={hasStoredWebhookSecret ? "Replace webhook secret (leave unchanged to keep current)" : "Webhook secret"}>
        <Input type="password" value={webhookSecret} placeholder={hasStoredWebhookSecret ? "••••••••••••••••" : undefined} onChange={(e) => setWebhookSecret(e.target.value)} autoComplete="new-password" />
      </Field>
      <p className="text-xs leading-relaxed text-muted-foreground">Use the same secret in Razorpay for the webhook URL below. Vera uses it to verify that incoming payment events genuinely came from Razorpay.</p>
      <p className="text-xs text-muted-foreground">
        Webhook URL: <span className="font-mono break-all">{webhookUrl}</span>
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-10 w-fit px-4">{isConfigured ? "Update Razorpay connection" : "Connect Razorpay"}</Button>
        {isConfigured ? <Button type="button" variant="outline" onClick={async () => {
          const res = await fetch("/api/v1/razorpay", { method: "DELETE" });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) return setMessage(data.error || "Disconnect failed");
          router.refresh();
        }}>Disconnect</Button> : null}
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}

export function RevokeKeyButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      className="h-8 px-3"
      onClick={async () => {
        await fetch(`/api/v1/keys/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      Revoke
    </Button>
  );
}

export function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  return (
    <div className="flex flex-wrap items-center gap-3">
    <Button
      type="button"
      variant="outline"
      className="h-10 px-4"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        setMessage(null);
        const [year, monthNumber] = month.split("-").map(Number);
        const res = await fetch("/api/v1/razorpay/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ settlement_year: year, settlement_month: monthNumber }) });
        const data = (await res.json()) as { inserted?: number; updated?: number; unchanged?: number; failed?: number; recon_processed?: number; errors?: string[]; error?: string };
        setPending(false);
        if (!res.ok) return setMessage(data.error || "Sync failed");
        setMessage(`${data.inserted ?? 0} new, ${data.updated ?? 0} updated, and ${data.unchanged ?? 0} already up to date. ${data.recon_processed ?? 0} settlement rows checked; ${data.failed ?? 0} failed.${data.errors?.length ? ` ${data.errors.join(" ")}` : ""}`);
        router.refresh();
      }}
    >
      {pending ? "Syncing…" : "Sync payments and settlements"}
    </Button>
    <Input aria-label="Month to import" inputMode="numeric" placeholder="YYYY-MM" pattern="\d{4}-\d{2}" title="Use YYYY-MM" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" />
    {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

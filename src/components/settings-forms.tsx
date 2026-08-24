"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

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
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="mt-1"/><span><span className="font-medium">Allow Razorpay live keys</span><span className="block text-xs text-muted-foreground">Test mode remains the default. Enable this only after TLS, backups, and webhook verification are in place.</span></span></label>
    <Button type="submit" className="h-10 w-fit px-4">Save installation settings</Button>
    {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
  </form>;
}

export function AiSettingsForm({ configured, initialProvider, initialModel, initialBaseUrl }: { configured: boolean; initialProvider: "anthropic" | "openai" | null; initialModel: string | null; initialBaseUrl: string | null }) {
  const [provider, setProvider] = useState<"anthropic" | "openai">(initialProvider ?? "anthropic");
  const [model, setModel] = useState(initialModel ?? "");
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? "https://api.anthropic.com");
  const [apiKey, setApiKey] = useState("");
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
    if (res.ok) setApiKey("");
  }}>
    <label className="grid gap-1.5 text-sm"><span className="font-medium">Provider</span><select className="h-10 rounded-md border border-input bg-background px-3" value={provider} onChange={(e) => changeProvider(e.target.value as "anthropic" | "openai")}><option value="anthropic">Anthropic</option><option value="openai">OpenAI-compatible</option></select></label>
    <Field label="Model"><Input required placeholder="Provider model ID" value={model} onChange={(e) => setModel(e.target.value)} /></Field>
    <Field label="Base URL"><Input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
    <Field label={configured ? "Replace API key" : "API key"}><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" /></Field>
    <div className="flex gap-3"><Button type="submit" className="h-10 w-fit px-4">{configured ? "Update AI settings" : "Connect AI"}</Button>{configured ? <Button type="button" variant="outline" onClick={async () => { await fetch("/api/v1/settings", { method: "DELETE" }); location.reload(); }}>Disconnect</Button> : null}</div>
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
        if (res.ok) router.refresh();
      }}
    >
      <Field label="Key ID (rzp_test_… or rzp_live_…)">
        <Input value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" />
      </Field>
      <Field label={configured ? "Replace key secret (leave blank to keep current)" : "Key secret"}>
        <Input type="password" required={!configured} value={keySecret} onChange={(e) => setKeySecret(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label={hasWebhookSecret ? "Replace webhook secret (leave blank to keep current)" : "Webhook secret"}>
        <Input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} autoComplete="new-password" />
      </Field>
      <p className="text-xs text-muted-foreground">
        Webhook URL: <span className="font-mono break-all">{webhookUrl}</span>
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-10 w-fit px-4">{configured ? "Update Razorpay connection" : "Connect Razorpay"}</Button>
        {configured ? <Button type="button" variant="outline" onClick={async () => {
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
        setMessage(`Imported ${data.inserted ?? 0}; updated ${data.updated ?? 0}; unchanged ${data.unchanged ?? 0}; settlement recon rows ${data.recon_processed ?? 0}; failed ${data.failed ?? 0}.${data.errors?.length ? ` ${data.errors.join(" ")}` : ""}`);
        router.refresh();
      }}
    >
      {pending ? "Syncing…" : "Sync payments and settlement recon"}
    </Button>
    <Input aria-label="Settlement recon month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" />
    {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

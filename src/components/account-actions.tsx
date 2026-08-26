"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-9 px-3"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
            if (!response.ok) {
              const body = (await response.json().catch(() => ({}))) as { error?: string };
              throw new Error(body.error || "Sign out failed");
            }
            window.location.replace("/login?notice=signed_out");
          } catch (error) {
            setError(error instanceof Error ? error.message : "Sign out failed");
            setPending(false);
          }
        }}
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error ? <Notice tone="error" role="alert" className="py-2 text-xs">{error}</Notice> : null}
    </div>
  );
}

type SessionView = {
  id: string;
  client_label: string;
  ip_hint: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  current: boolean;
};

function utcTime(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function SessionManager({ sessions }: { sessions: SessionView[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const otherSessions = sessions.filter((session) => !session.current);

  async function revoke(url: string, pendingKey: string) {
    setPending(pendingKey);
    setMessage(null);
    try {
      const response = await fetch(url, { method: "DELETE", credentials: "same-origin", cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; revoked?: number };
      if (!response.ok) throw new Error(body.error || "Session revocation failed");
      setMessage(typeof body.revoked === "number" ? `${body.revoked} other session${body.revoked === 1 ? "" : "s"} signed out.` : "Session signed out.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Session revocation failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {sessions.map((session) => (
          <div key={session.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{session.client_label}</p>
                {session.current ? <span className="rounded-full bg-brand/12 px-2 py-0.5 text-xs font-medium text-brand">Current session</span> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {session.ip_hint} · Last seen {utcTime(session.last_seen_at)} · Created {utcTime(session.created_at)} · Expires {utcTime(session.expires_at)}
              </p>
            </div>
            {!session.current ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 shrink-0 px-3"
                disabled={pending !== null}
                onClick={() => revoke(`/api/auth/sessions/${encodeURIComponent(session.id)}`, session.id)}
              >
                {pending === session.id ? "Signing out…" : "Sign out session"}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {otherSessions.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 w-fit px-4"
          disabled={pending !== null}
          onClick={() => revoke("/api/auth/sessions", "others")}
        >
          {pending === "others" ? "Signing out…" : `Sign out all other sessions (${otherSessions.length})`}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">No other active sessions.</p>
      )}
      {message ? <Notice>{message}</Notice> : null}
    </div>
  );
}

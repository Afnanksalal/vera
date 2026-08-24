"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
      {error ? <span role="alert" aria-live="polite" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

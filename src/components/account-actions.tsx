"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
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
          const response = await fetch("/api/auth/logout", { method: "POST" });
          if (!response.ok) {
            const body = (await response.json()) as { error?: string };
            setError(body.error || "Sign out failed");
            setPending(false);
            return;
          }
          router.replace("/login");
          router.refresh();
        }}
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

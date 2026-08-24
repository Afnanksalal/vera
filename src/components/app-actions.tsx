"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CloseButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        disabled={pending}
        className="h-10 px-4"
        onClick={async () => {
          setPending(true);
          setError(null);
          const res = await fetch("/api/v1/close", { method: "POST" });
          const data = (await res.json()) as { error?: string };
          setPending(false);
          if (!res.ok) {
            setError(data.error || "Close failed");
            return;
          }
          router.refresh();
        }}
      >
        {pending ? "Checking…" : "Check latest records"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

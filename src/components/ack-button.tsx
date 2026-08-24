"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AckButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:min-w-[18rem] sm:justify-end">
    <Input
      aria-label="Review note"
      placeholder="Add a note (optional)"
      maxLength={500}
      value={note}
      onChange={(event) => setNote(event.target.value)}
      className="h-8 min-w-48 flex-1"
    />
    <Button
      type="button"
      variant="outline"
      className="h-8 px-3"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        setError(null);
        const response = await fetch(`/api/v1/reviews/${id}/ack`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note }),
        });
        setPending(false);
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          setError(body.error || "Could not acknowledge review");
          return;
        }
        router.refresh();
      }}
    >
      {pending ? "Saving…" : "Mark reviewed"}
    </Button>
    {error ? <p className="w-full text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

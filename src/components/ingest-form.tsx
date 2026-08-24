"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function IngestForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setMessage("Choose a JSON file first.");
    setPending(true);
    setMessage(null);
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const records = Array.isArray(raw) ? raw : (raw as { records?: unknown })?.records;
      const res = await fetch("/api/v1/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const data = (await res.json()) as { inserted?: number; updated?: number; unchanged?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Import failed");
      setMessage(`${data.inserted ?? 0} new, ${data.updated ?? 0} updated, and ${data.unchanged ?? 0} already up to date.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input ref={fileRef} type="file" accept="application/json,.json" className="w-full max-w-xs text-sm" />
      <Button type="button" variant="outline" disabled={pending} onClick={submit}>
        {pending ? "Importing…" : "Import JSON file"}
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

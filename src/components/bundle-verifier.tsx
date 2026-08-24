"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function BundleVerifier() {
  const file = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  return <div className="flex min-w-0 flex-wrap items-center gap-3"><input ref={file} type="file" accept="application/json,.json" className="w-full max-w-xs text-sm"/><Button variant="outline" onClick={async () => {
    const selected = file.current?.files?.[0];
    if (!selected) return setStatus("Choose an audit bundle.");
    try {
      const res = await fetch("/api/v1/verify-bundle", { method: "POST", headers: { "content-type": "application/json" }, body: await selected.text() });
      const data = (await res.json()) as { ok?: boolean; trusted_signer?: boolean; notes?: string[]; error?: string };
      setStatus(res.ok && data.ok ? "Verified: chain, replay, signature, and installation identity are valid." : data.error || data.notes?.join("; ") || (data.trusted_signer === false ? "Signature is valid but not from this Vera installation." : "Verification failed."));
    } catch (error) { setStatus(error instanceof Error ? error.message : "Verification failed."); }
  }}>Verify bundle</Button>{status ? <p className="text-sm text-muted-foreground">{status}</p> : null}</div>;
}

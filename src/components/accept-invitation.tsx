"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useRouter } from "next/navigation";

export function AcceptInvitation({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  return <div className="grid gap-3"><Button type="button" onClick={async () => { const response = await fetch("/api/v1/organizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept", token }) }); const body = await response.json() as { error?: string }; if (!response.ok) return setMessage(body.error || "Could not accept invitation."); router.push("/app"); router.refresh(); }}>Join organization</Button>{message ? <Notice tone="error" role="alert">{message}</Notice> : null}</div>;
}

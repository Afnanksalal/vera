"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui/notice";

export function KeyRotation({ ready, lastRotatedAt }: { ready: boolean; lastRotatedAt: number | null }) {
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [message, setMessage] = useState<string | null>(null); const [pending, setPending] = useState(false);
  const router = useRouter();
  return <div className="grid max-w-lg gap-3"><div className="rounded-lg border border-border p-3 text-xs leading-relaxed text-muted-foreground"><p className="font-medium text-foreground">Crash-safe credential rotation</p><p className="mt-1">Vera re-encrypts every stored provider and signing credential, then revokes every session, pending organization invitation, and integration API key. You will need to sign in and recreate API keys afterward.</p>{lastRotatedAt ? <p className="mt-2">Last rotated {new Date(lastRotatedAt).toLocaleString()}.</p> : null}</div>{!ready ? <Notice>Create and verify an encrypted backup above before rotating. A verified backup remains eligible for 24 hours.</Notice> : <><Field label="Current password"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}/></Field><Field label="Type ROTATE to confirm"><Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/></Field><Button type="button" variant="outline" className="w-fit border-destructive text-destructive" disabled={pending || !password || confirmation !== "ROTATE"} onClick={async () => { setPending(true); setMessage(null); const response = await fetch("/api/v1/security/rotate-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current_password: password, confirmation }) }); const body = await response.json() as { error?: string }; setPending(false); if (!response.ok) return setMessage(body.error || "Rotation failed."); router.push("/login"); router.refresh(); }}>{pending ? "Rotating…" : "Rotate master key"}</Button></>}{message ? <Notice>{message}</Notice> : null}</div>;
}

"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

type History = { id: string; action: string; detail: string; created_at: number };

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the backup file."));
    reader.readAsDataURL(file);
  });
}

export function BackupManager({ history }: { history: History[] }) {
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const verifyRef = useRef<HTMLInputElement>(null);

  async function create() {
    setPending(true); setMessage(null);
    try {
      const response = await fetch("/api/v1/backups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase }) });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error || "Backup failed."); }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? "vera-backup.vera";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
      setMessage("Encrypted backup downloaded. Keep the file and passphrase in separate secure locations.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Backup failed."); }
    finally { setPending(false); }
  }

  async function verify() {
    const file = verifyRef.current?.files?.[0];
    if (!file) return setMessage("Choose a .vera backup to verify.");
    setPending(true); setMessage(null);
    try {
      const response = await fetch("/api/v1/backups", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase, file_base64: await fileBase64(file) }) });
      const body = await response.json() as { error?: string; created_at?: string; database_bytes?: number };
      if (!response.ok) throw new Error(body.error || "Verification failed.");
      setMessage(`Backup verified. Created ${new Date(body.created_at!).toLocaleString()} with ${Math.round((body.database_bytes ?? 0) / 1024).toLocaleString()} KB of recoverable data.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verification failed."); }
    finally { setPending(false); }
  }

  return <div className="grid gap-5">
    <div className="grid max-w-lg gap-3">
      <Field label="Backup passphrase"><Input type="password" minLength={16} maxLength={256} autoComplete="new-password" placeholder="At least 16 characters" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /></Field>
      <p className="text-xs leading-relaxed text-muted-foreground">The download contains the database and installation encryption key inside one AES-256-GCM encrypted file. Vera never stores the passphrase.</p>
      <div className="flex flex-wrap gap-3"><Button type="button" disabled={pending || passphrase.length < 16} onClick={create}>{pending ? "Working…" : "Download encrypted backup"}</Button><Button type="button" variant="outline" disabled={pending || passphrase.length < 16} onClick={verify}>Verify a backup</Button></div>
      <Input ref={verifyRef} type="file" accept=".vera,application/vnd.vera.backup+json" className="h-auto min-h-10 py-2" />
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
    <details><summary className="cursor-pointer text-sm font-medium">Backup audit log</summary><div className="mt-3 grid gap-2">{history.length ? history.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"><span>{item.action.replaceAll("_", " ")}</span><time className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</time></div>) : <p className="text-sm text-muted-foreground">No backups created yet.</p>}</div></details>
  </div>;
}

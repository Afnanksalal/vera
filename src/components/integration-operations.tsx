"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { IntegrationOperations } from "@/server/chat-integrations";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";

export function IntegrationOperationsPanel({ operations }: { operations: IntegrationOperations }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const failed = operations.deliveries.filter((item) => item.status === "failed");
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold">Delivery operations</h3>
      {failed.length ? <Button type="button" variant="outline" disabled={pending} onClick={async () => {
        setPending(true); setMessage(null);
        const provider = failed[0].provider;
        const response = await fetch(`/api/v1/chat-integrations/${provider}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "retry" }) });
        const body = await response.json() as { error?: string; queued?: number; delivered?: number };
        setPending(false);
        setMessage(response.ok ? `${body.queued ?? 0} deliveries requeued; ${body.delivered ?? 0} delivered now.` : body.error || "Retry failed.");
        router.refresh();
      }}>{pending ? "Retrying…" : "Retry failed deliveries"}</Button> : null}
    </div>
    {message ? <Notice>{message}</Notice> : null}
    {operations.deliveries.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-muted-foreground"><tr><th className="pb-2 font-medium">Provider</th><th className="pb-2 font-medium">Event</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium">Attempts</th><th className="pb-2 font-medium">Last result</th></tr></thead><tbody>{operations.deliveries.map((item) => <tr key={item.id} className="border-t border-border"><td className="py-3 capitalize">{item.provider}</td><td className="py-3 font-mono text-xs">{item.event_key}</td><td className="py-3 capitalize">{item.status}</td><td className="py-3">{item.attempts}</td><td className="max-w-xs truncate py-3 text-xs text-muted-foreground">{item.last_error ?? (item.delivered_at ? new Date(item.delivered_at).toLocaleString() : "Waiting")}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No notification deliveries yet.</p>}
    <Disclosure title="Integration audit log"><div className="grid gap-2">{operations.audit.length ? operations.audit.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"><span><span className="capitalize">{item.provider}</span> · {item.action}</span><time className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</time></div>) : <p className="text-sm text-muted-foreground">No integration changes recorded.</p>}</div></Disclosure>
  </div>;
}

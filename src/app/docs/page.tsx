import type { Metadata } from "next";
import Link from "next/link";
import { DocumentCallout, DocumentList, DocumentSection, PublicDocument } from "@/components/public-document";
import { REPOSITORY_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Set up, operate, integrate, secure, and self-host Vera from the web console and HTTP API.",
  alternates: { canonical: "/docs" },
};

const links = [
  ["#start", "Quick start"], ["#settings", "Configuration"], ["#workflow", "Core workflow"],
  ["#proof", "Proof model"], ["#ai", "AI investigator"], ["#roles", "Organizations"],
  ["#api", "Integration API"], ["#deploy", "Self-hosting"], ["#operations", "Operations"],
].map(([href, label]) => ({ href, label }));

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-xl bg-foreground p-4 text-sm leading-6 text-background"><code>{children}</code></pre>;
}

function RouteTable() {
  const rows = [
    ["POST", "/api/v1/ingest", "Import AP2, ACP, or x402 records"],
    ["GET / POST", "/api/v1/purchases", "List or create signed purchase sessions"],
    ["POST", "/api/v1/close", "Run the seven checks"],
    ["GET", "/api/v1/ledger", "Read the latest claim ledger"],
    ["GET", "/api/v1/closes", "List signed reports"],
    ["POST", "/api/v1/evidence", "Attach source evidence and recheck"],
    ["GET / POST", "/api/v1/analysis", "Run reconciliation and anomaly analysis"],
    ["GET", "/api/v1/metrics", "Read Prometheus metrics"],
  ];
  return <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted/60 text-foreground"><tr><th className="px-4 py-3 font-medium">Method</th><th className="px-4 py-3 font-medium">Route</th><th className="px-4 py-3 font-medium">Purpose</th></tr></thead><tbody>{rows.map(([method, route, purpose]) => <tr key={route} className="border-t border-border"><td className="px-4 py-3 font-mono text-xs text-foreground">{method}</td><td className="px-4 py-3 font-mono text-xs">{route}</td><td className="px-4 py-3">{purpose}</td></tr>)}</tbody></table></div>;
}

export default function DocsPage() {
  return <PublicDocument eyebrow="Documentation" title="Operate Vera" summary="Everything required to configure a workspace, prove a purchase, connect integrations, and run Vera in production." links={links}>
    <DocumentSection id="start" title="Quick start">
      <ol className="grid list-decimal gap-3 pl-5 marker:font-semibold marker:text-brand">
        <li>Create an account. The first account becomes the installation owner; every account receives a private organization.</li>
        <li>Open <Link href="/app/settings" className="font-medium text-brand hover:underline">Settings</Link> and set the canonical public URL.</li>
        <li>Connect Razorpay test credentials and a webhook secret. Connect an AI provider for investigation and model-assisted reconciliation.</li>
        <li>Use <Link href="/app/pay" className="font-medium text-brand hover:underline">Purchase</Link> to create a signed mandate and cart, then complete Razorpay Checkout.</li>
        <li>Sync payments and settlements, connect a RazorpayX bank feed or attach bank evidence, then run a report.</li>
        <li>Review issues, investigate individual payments, and download the signed evidence bundle.</li>
      </ol>
      <DocumentCallout title="Use test mode first">Live Razorpay keys stay blocked until the installation owner enables them. Configure HTTPS, webhooks, monitoring, and a verified backup before doing so.</DocumentCallout>
    </DocumentSection>
    <DocumentSection id="settings" title="Configuration">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Organization", "Workspace name, members, roles, invitations, and audit history."],
          ["Razorpay", "Key ID, key secret, webhook secret, payment sync, and RazorpayX bank feed."],
          ["AI investigator", "Anthropic or OpenAI-compatible endpoint, model ID, and API key."],
          ["Slack and Discord", "Notifications, verified commands, delivery status, and audit history."],
          ["Integration keys", "Organization-scoped bearer keys for server integrations."],
          ["Installation", "Public URL, capacity, live-payment control, health, backups, and key rotation."],
        ].map(([title, body]) => <div key={title} className="rounded-xl border border-border p-4"><p className="font-medium text-foreground">{title}</p><p className="mt-1 text-sm leading-6">{body}</p></div>)}
      </div>
      <p>Configuration is stored in SQLite. Provider secrets are encrypted with the installation master key; no product configuration requires a <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">.env</code> file.</p>
    </DocumentSection>
    <DocumentSection id="workflow" title="Core workflow">
      <ol className="grid list-decimal gap-3 pl-5 marker:font-semibold marker:text-brand">
        <li><span className="font-medium text-foreground">Authorize:</span> Vera signs a mandate covering agent, budget, category, and validity.</li>
        <li><span className="font-medium text-foreground">Bind the cart:</span> Vera signs the exact SKU, quantity, unit amount, and total before creating the Razorpay order.</li>
        <li><span className="font-medium text-foreground">Capture:</span> Razorpay Checkout returns a payment ID and signature; Vera verifies both and fetches the payment from Razorpay.</li>
        <li><span className="font-medium text-foreground">Collect evidence:</span> receipts, official settlement reconciliation, and bank credits arrive independently.</li>
        <li><span className="font-medium text-foreground">Close:</span> Vera checks every claim, opens review items, chains events, and signs the report.</li>
      </ol>
      <p>A webhook is recommended for prompt, signature-verified provider events. Manual payment and settlement sync remains available and does not depend on a webhook.</p>
    </DocumentSection>
    <DocumentSection id="proof" title="The seven checks">
      <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted/60 text-foreground"><tr><th className="px-4 py-3 font-medium">Check</th><th className="px-4 py-3 font-medium">Evidence</th></tr></thead><tbody>{[
        ["Authorized", "Valid signed mandate, budget, category, and time window"],
        ["Cart bound", "Valid merchant cart signature and exact payment total"],
        ["Receipted", "Durable receipt and valid attestation when supplied"],
        ["Idempotent", "One payment per idempotency key"],
        ["Settled", "Processor settlement with gross − fees − tax = net"],
        ["Banked", "Unique bank credit matching settlement net and provenance"],
        ["Refund policy", "Refund mandate provenance without collisions"],
      ].map(([claim, evidence]) => <tr key={claim} className="border-t border-border"><td className="px-4 py-3 font-medium text-foreground">{claim}</td><td className="px-4 py-3">{evidence}</td></tr>)}</tbody></table></div>
      <p>Every check ends as proven, needs attention, or inconclusive. Missing evidence stays missing. Amount and date similarity alone never proves mandate authorization, receipt durability, or bank provenance.</p>
    </DocumentSection>
    <DocumentSection id="ai" title="AI investigator">
      <p>AI is the investigation layer. It calls bounded evidence tools, explains discrepancies, proposes claim outcomes, groups settlements, and proposes anomaly rules. The deterministic verifier is the mutation boundary: it replays tool results and rejects unsupported proposals.</p>
      <DocumentList>
        <li><span className="font-medium text-foreground">Anthropic:</span> use a current Claude model ID available to your account and the default Anthropic base URL.</li>
        <li><span className="font-medium text-foreground">OpenAI-compatible:</span> provide a compatible chat-completions base URL, model ID, and key.</li>
        <li>Evidence-derived records are sent to the configured provider only when an AI operation runs.</li>
      </DocumentList>
    </DocumentSection>
    <DocumentSection id="roles" title="Organizations and roles">
      <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted/60 text-foreground"><tr><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Access</th></tr></thead><tbody>{[
        ["Owner", "Read, operate, review, integrations, and members"], ["Admin", "Read, operate, review, integrations, and members"],
        ["Operator", "Read and operate"], ["Auditor", "Read and review"], ["Viewer", "Read only"], ["Integration key", "Read and operate within one organization"],
      ].map(([role, access]) => <tr key={role} className="border-t border-border"><td className="px-4 py-3 font-medium text-foreground">{role}</td><td className="px-4 py-3">{access}</td></tr>)}</tbody></table></div>
      <p>Invitations are email-bound and expire after seven days. Permissions are enforced in server routes, not only hidden in the interface.</p>
    </DocumentSection>
    <DocumentSection id="api" title="Integration API">
      <p>Create an integration key in Settings and send it as a bearer token. Keys are shown once and scoped to the active organization.</p>
      <Code>{`Authorization: Bearer vera_…\nContent-Type: application/json`}</Code>
      <RouteTable />
      <p>Ingest requests accept at most 200 records and 1 MB. Monetary fields use integer paise. The complete route and payload contract is maintained in <a href={`${REPOSITORY_URL}/blob/main/docs/API.md`} className="font-medium text-brand hover:underline">API.md</a>.</p>
    </DocumentSection>
    <DocumentSection id="deploy" title="Self-hosting">
      <p>Vera ships as one application container with a named data volume. You need Git, Docker Engine with Compose, a host with persistent storage, and a domain routed through an HTTPS reverse proxy. No <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">.env</code> file is required.</p>
      <h3 className="text-lg font-semibold text-foreground">Install and start</h3>
      <Code>{`git clone ${REPOSITORY_URL}.git\ncd vera\ndocker compose up -d --build\ncurl http://127.0.0.1:43147/api/health`}</Code>
      <p>The Compose stack binds Vera to loopback on port <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">43147</code>, stores the database and master key in the <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">vera-data</code> volume, runs as a non-root user, and includes a container health check and background worker.</p>
      <h3 className="text-lg font-semibold text-foreground">Put Vera behind HTTPS</h3>
      <p>For a host-installed Caddy server, replace the domain below with one whose DNS record points to the server:</p>
      <Code>{`vera.example.com {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:43147\n}`}</Code>
      <DocumentList>
        <li>open the HTTPS domain and create the first installation owner at <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">/signup</code>;</li>
        <li>set that exact HTTPS origin as the canonical public URL under Settings → Installation;</li>
        <li>configure Razorpay, the AI investigator, backup passphrases, and integrations entirely in Settings;</li>
        <li>keep the application port private and expose only the reverse proxy;</li>
        <li>run only one Vera application process against each SQLite data volume.</li>
      </DocumentList>
      <h3 className="text-lg font-semibold text-foreground">Upgrade</h3>
      <Code>{`git pull --ff-only\ndocker compose build --pull\ndocker compose up -d\ndocker compose ps`}</Code>
      <p>Create and verify an encrypted recovery backup in Settings before upgrading. The database and installation master key live together in the persistent volume and must be recovered together.</p>
      <p>See <a href={`${REPOSITORY_URL}/blob/main/docs/ARCHITECTURE.md`} className="font-medium text-brand hover:underline">Architecture</a> and <a href={`${REPOSITORY_URL}/blob/main/docs/SECURITY.md`} className="font-medium text-brand hover:underline">Security model</a> for trust boundaries.</p>
    </DocumentSection>
    <DocumentSection id="operations" title="Production operations">
      <DocumentList>
        <li>monitor <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">/api/health</code> and authenticated Prometheus metrics;</li>
        <li>collect structured container logs and alert on worker, queue, integrity, and backup failures;</li>
        <li>create and verify encrypted backups from Settings, storing the file and passphrase separately;</li>
        <li>test offline recovery on a disposable host and restore the database and master key together;</li>
        <li>verify a fresh backup before rotating the master key.</li>
      </DocumentList>
      <p>The full runbook is maintained in <a href={`${REPOSITORY_URL}/blob/main/docs/OPERATIONS.md`} className="font-medium text-brand hover:underline">OPERATIONS.md</a>. For vulnerabilities, use the private channel on the <Link href="/security" className="font-medium text-brand hover:underline">Security page</Link>.</p>
    </DocumentSection>
  </PublicDocument>;
}

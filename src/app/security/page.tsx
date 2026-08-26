import type { Metadata } from "next";
import { DocumentCallout, DocumentList, DocumentSection, PublicDocument } from "@/components/public-document";
import { REPOSITORY_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Security",
  description: "Vera security architecture, trust boundaries, deployment requirements, and responsible vulnerability reporting.",
  alternates: { canonical: "/security" },
};

const links = [
  ["#report", "Report a vulnerability"], ["#model", "Security model"], ["#identity", "Keys and identity"],
  ["#access", "Access control"], ["#payments", "Payment security"], ["#ai", "AI boundary"],
  ["#deployment", "Deployment"], ["#backups", "Backups"], ["#limits", "Known boundaries"],
].map(([href, label]) => ({ href, label }));

export default function SecurityPage() {
  return <PublicDocument eyebrow="Trust center" title="Security at Vera" summary="Vera treats models, browser input, provider callbacks, and imported evidence as untrusted until independently verified." updated="27 August 2026" links={links}>
    <DocumentSection id="report" title="Report a vulnerability">
      <DocumentCallout title="Use private disclosure">Submit security issues through <a href={`${REPOSITORY_URL}/security/advisories/new`} className="font-medium text-brand hover:underline">GitHub Security Advisories</a>. Do not open a public issue containing exploit details, credentials, account data, or payment evidence.</DocumentCallout>
      <p>Include the affected version or URL, impact, reproduction steps, and a minimal proof of concept. Do not access another user’s data, move real funds, degrade availability, or retain data encountered during testing. There is currently no paid bug-bounty program.</p>
    </DocumentSection>
    <DocumentSection id="model" title="Security model">
      <p>Vera is a single-instance, self-hosted web application with a tenant-scoped SQLite system of record. Its security design separates evidence ingestion, investigation, deterministic verification, organization authorization, and installation signing.</p>
      <DocumentList>
        <li>all workspace reads and writes resolve through the active organization;</li>
        <li>cookie mutations enforce same-origin requests;</li>
        <li>integration API keys are organization-scoped and stored as hashes;</li>
        <li>Razorpay webhooks are verified over the raw request body before ingestion;</li>
        <li>source artifacts are hashed and signed reports bind the world, event chain, evidence digest, and signer identity.</li>
      </DocumentList>
    </DocumentSection>
    <DocumentSection id="identity" title="Encryption, keys, and identity">
      <p>Each installation creates a persistent master-key keyring and a stable Ed25519 audit identity. Provider credentials, workspace signing keys, and the audit private key are encrypted with AES-256-GCM. Passwords use a memory-hard hash. Session tokens, API keys, and invitation tokens are stored as cryptographic hashes rather than plaintext.</p>
      <p>The master key and database are one recovery unit. Losing the key makes encrypted credentials unrecoverable; obtaining both the key and database exposes them. Filesystem and backup controls remain part of the operator’s responsibility.</p>
    </DocumentSection>
    <DocumentSection id="access" title="Sessions and access control">
      <DocumentList>
        <li>session cookies are HttpOnly, SameSite=Lax, and Secure when served through HTTPS;</li>
        <li>active sessions expose only a browser/platform label and masked IP hint;</li>
        <li>owner and admin can manage members and integrations; operator can operate; auditor can read and review; viewer is read-only;</li>
        <li>email-bound invitations expire after seven days;</li>
        <li>master-key rotation revokes sessions, API keys, and pending invitations.</li>
      </DocumentList>
    </DocumentSection>
    <DocumentSection id="payments" title="Payment and webhook security">
      <p>Vera persists signed mandate and cart evidence before creating a Razorpay order. Checkout signatures are verified and the payment is fetched from Razorpay before it is bound to stored evidence. Browser-supplied amounts and statuses are not trusted.</p>
      <p>Test credentials are the default. Live credentials require installation-owner approval. Vera does not fabricate settlement or bank evidence, and ambiguous bank credits remain unmatched.</p>
    </DocumentSection>
    <DocumentSection id="ai" title="AI trust boundary">
      <p>The AI investigator may gather evidence and propose a result. It cannot change claim status. Vera replays cited tool calls, checks referenced rows and hashes, and independently derives the final decision. Unsupported proposals are rejected or abstained for review.</p>
    </DocumentSection>
    <DocumentSection id="deployment" title="Production deployment requirements">
      <DocumentList>
        <li>run one Vera process per SQLite database and persistent local volume;</li>
        <li>terminate TLS at a trusted reverse proxy and preserve forwarded host and protocol headers;</li>
        <li>keep port 43147 private, publish only the proxy, and never expose the data directory;</li>
        <li>run the container as non-root with a read-only root filesystem and no-new-privileges;</li>
        <li>collect structured logs, monitor the health and metrics endpoints, and alert on worker, queue, integrity, and backup failures;</li>
        <li>do not run multiple replicas against one SQLite file or place it on a network filesystem.</li>
      </DocumentList>
    </DocumentSection>
    <DocumentSection id="backups" title="Backups and key rotation">
      <p>Settings can create a passphrase-encrypted recovery package containing the SQLite database and master key. Verify every backup, store it away from the host, and keep the passphrase separately. Restore is intentionally offline.</p>
      <p>Master-key rotation requires a backup verified within the previous 24 hours. Rotation re-encrypts stored secrets transactionally and preserves the prior key during staging for crash recovery.</p>
    </DocumentSection>
    <DocumentSection id="limits" title="Known boundaries">
      <DocumentList>
        <li>Vera is not a PCI card vault and must not receive full card details, CVVs, or OTPs.</li>
        <li>Host compromise, stolen operator credentials, unsafe reverse-proxy configuration, or exposed backups can defeat application controls.</li>
        <li>Signed bundles prove consistency with the installation’s records and identity; they do not prove that an upstream source was honest.</li>
        <li>No software or AI system guarantees detection of every error or fraud pattern.</li>
      </DocumentList>
    </DocumentSection>
  </PublicDocument>;
}

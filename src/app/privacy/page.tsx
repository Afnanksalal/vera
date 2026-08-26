import type { Metadata } from "next";
import { DocumentCallout, DocumentLink, DocumentList, DocumentSection, PublicDocument } from "@/components/public-document";
import { REPOSITORY_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How the hosted Vera service collects, uses, shares, protects, and retains personal and financial records.",
  alternates: { canonical: "/privacy" },
};

const links = [
  ["#scope", "Scope"], ["#data", "Data collected"], ["#use", "How data is used"], ["#providers", "Providers"],
  ["#sharing", "Sharing"], ["#security", "Security"], ["#retention", "Retention"], ["#rights", "Your rights"],
  ["#cookies", "Cookies"], ["#children", "Children"], ["#changes", "Changes"], ["#contact", "Contact"],
].map(([href, label]) => ({ href, label }));

export default function PrivacyPage() {
  return <PublicDocument eyebrow="Legal" title="Privacy Policy" summary="This notice describes the public Vera instance. Self-hosted installations are controlled by their own operators." updated="27 August 2026" links={links}>
    <DocumentSection id="scope" title="1. Scope and roles">
      <p>This Policy applies when you use this hosted Vera website, create an account, join an organization, or connect an integration. The operator of this instance determines how service-level account and operational data is processed.</p>
      <DocumentCallout title="Self-hosted Vera">If you use a Vera installation hosted by another person or organization, that operator—not this public instance—controls the installation and its data. Contact that operator for its privacy notice and requests.</DocumentCallout>
    </DocumentSection>
    <DocumentSection id="data" title="2. Data Vera collects">
      <DocumentList>
        <li><span className="font-medium text-foreground">Account data:</span> email address, password hash, account and organization identifiers, memberships, roles, invitations, and audit history.</li>
        <li><span className="font-medium text-foreground">Session data:</span> a hashed session token, browser and platform label, a masked IP hint, creation time, last activity, expiry, and active organization.</li>
        <li><span className="font-medium text-foreground">Financial workflow data:</span> mandates, carts, payment and order identifiers, amounts, receipts, refunds, settlements, UTRs, bank-credit records, uploaded evidence files, hashes, reports, reviews, and investigation results.</li>
        <li><span className="font-medium text-foreground">Configuration:</span> public URL, provider names, model IDs, storage limits, notification preferences, and encrypted Razorpay, AI, chat, and bank-feed credentials.</li>
        <li><span className="font-medium text-foreground">Operational data:</span> webhook events, delivery attempts, health state, backup and key-rotation audit entries, errors, and security logs.</li>
      </DocumentList>
      <p>Razorpay Checkout collects payment-card details, CVVs, and OTPs in its own interface. Vera receives provider identifiers and verification results; it is not designed to store complete card credentials or OTPs.</p>
    </DocumentSection>
    <DocumentSection id="use" title="3. How data is used">
      <DocumentList>
        <li>authenticate users, maintain sessions, enforce roles, and secure organizations;</li>
        <li>ingest, normalize, reconcile, investigate, verify, sign, export, and display payment evidence;</li>
        <li>connect providers, process webhooks, deliver configured notifications, and run background synchronization;</li>
        <li>detect abuse, diagnose failures, maintain backups, preserve audit integrity, and protect the service;</li>
        <li>comply with lawful requests and enforce the <DocumentLink href="/terms">Terms of Service</DocumentLink>.</li>
      </DocumentList>
      <p>Depending on your location, processing may rely on providing the requested service, your consent for optional integrations, legitimate interests in security and reliable operation, and applicable legal obligations.</p>
    </DocumentSection>
    <DocumentSection id="providers" title="4. Connected providers and AI">
      <p>When you connect Razorpay or RazorpayX, Vera exchanges payment, order, settlement, and bank-feed data with those services. When you enable Slack or Discord, configured reports, issue summaries, commands, and delivery metadata are exchanged with that provider.</p>
      <p>When you run an AI feature, Vera sends the configured Anthropic or OpenAI-compatible endpoint the evidence-derived records, identifiers, amounts, narration, and tool results required for that investigation or reconciliation. Do not enable AI for data you are not authorized to send to that provider. The provider’s own privacy terms apply.</p>
    </DocumentSection>
    <DocumentSection id="sharing" title="5. When data is shared">
      <p>Data may be available to authorized members of your Vera organization, the infrastructure providers that host this public instance, providers you connect, and service personnel who need access to operate or secure the service. It may also be disclosed when required by law, to respond to abuse or security threats, or in connection with a reorganization of the hosted service.</p>
      <p>Vera does not sell personal data or use payment evidence for behavioural advertising. This hosted instance does not intentionally run third-party advertising trackers.</p>
    </DocumentSection>
    <DocumentSection id="security" title="6. Security">
      <DocumentList>
        <li>passwords are hashed; session and integration tokens are stored as hashes;</li>
        <li>provider credentials and signing keys are encrypted with the installation master key;</li>
        <li>session cookies are HttpOnly and SameSite, with Secure enabled over HTTPS;</li>
        <li>workspace access and mutations are checked server-side by role;</li>
        <li>evidence is hashed, report events are chained, and audit bundles are signed;</li>
        <li>structured logs redact secret-shaped fields.</li>
      </DocumentList>
      <p>No security measure eliminates all risk. Exported bundles and backups can contain sensitive financial records and must be protected by the recipient.</p>
      <p>See the public <DocumentLink href="/security">Security page</DocumentLink> for deployment boundaries and vulnerability reporting.</p>
    </DocumentSection>
    <DocumentSection id="retention" title="7. Retention and deletion">
      <p>Account, workspace, evidence, report, investigation, and audit data remains in the installation database until it is deleted by the operator or removed under an applicable retention process. Expired sessions are deleted automatically; disconnected provider credentials and revoked API keys are removed from active use. Encrypted backups and infrastructure logs may remain for a limited recovery or security period.</p>
      <p>Vera currently has no self-service account-deletion control. Contact the instance operator to request access, correction, export, restriction, or deletion. Some records may be retained where necessary for security, legal obligations, disputes, audit integrity, or the rights of other organization members.</p>
    </DocumentSection>
    <DocumentSection id="rights" title="8. Your choices and rights">
      <DocumentList>
        <li>review active sessions and revoke other sessions from Settings;</li>
        <li>disconnect Razorpay, AI, chat, and bank-feed integrations;</li>
        <li>revoke integration API keys and manage organization access;</li>
        <li>download signed reports and encrypted recovery backups where your role permits;</li>
        <li>request access, correction, deletion, restriction, portability, objection, or withdrawal of consent where applicable law provides those rights.</li>
      </DocumentList>
      <p>Requests may require identity and authority verification, particularly for shared organization or financial records.</p>
    </DocumentSection>
    <DocumentSection id="cookies" title="9. Cookies">
      <p>Vera uses one essential session cookie to keep you signed in and protect authenticated requests. It is not used for advertising. Because this hosted instance does not intentionally use non-essential analytics or advertising cookies, it does not show a consent banner for them.</p>
    </DocumentSection>
    <DocumentSection id="children" title="10. Children">
      <p>Vera is a business and developer tool, not a service directed to children. Do not create an account or submit a child’s personal data unless you are legally authorized to do so.</p>
    </DocumentSection>
    <DocumentSection id="changes" title="11. Changes">
      <p>This Policy may change as Vera, its hosting, or applicable law changes. The updated date identifies the current version. Material changes will be presented through the website or another reasonable channel.</p>
    </DocumentSection>
    <DocumentSection id="contact" title="12. Contact">
      <p>Contact the operator of the Vera instance you use. For this public instance, contact the maintainer through the <a href={REPOSITORY_URL} className="font-medium text-brand hover:underline">Vera repository</a>. Do not place passwords, secrets, evidence files, or private financial information in a public issue.</p>
    </DocumentSection>
  </PublicDocument>;
}

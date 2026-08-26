import type { Metadata } from "next";
import { DocumentCallout, DocumentLink, DocumentList, DocumentSection, PublicDocument } from "@/components/public-document";
import { LICENSE_URL, REPOSITORY_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing use of the hosted Vera service and the distinction between the hosted service and self-hosted Vera software.",
  alternates: { canonical: "/terms" },
};

const links = [
  ["#scope", "Scope"], ["#accounts", "Accounts"], ["#use", "Acceptable use"], ["#data", "Your data"],
  ["#third-parties", "Third parties"], ["#risk", "Financial risk"], ["#availability", "Availability"],
  ["#liability", "Liability"], ["#termination", "Termination"], ["#law", "Governing law"], ["#contact", "Contact"],
].map(([href, label]) => ({ href, label }));

export default function TermsPage() {
  return <PublicDocument eyebrow="Legal" title="Terms of Service" summary="These terms apply to the public Vera service. A self-hosted Vera installation is operated under its own operator’s terms." updated="27 August 2026" links={links}>
    <DocumentSection id="scope" title="1. Scope and acceptance">
      <p>By creating an account or using this hosted instance, you agree to these Terms and the <DocumentLink href="/privacy">Privacy Policy</DocumentLink>. If you use Vera for an organization, you confirm that you have authority to bind that organization.</p>
      <DocumentCallout title="Hosted service versus open-source software">These Terms govern this hosted service. The Vera source code is separately available under the <a href={LICENSE_URL} className="font-medium text-brand hover:underline">MIT License</a>. A self-hosted operator controls its installation, accounts, data, security, and legal notices.</DocumentCallout>
    </DocumentSection>
    <DocumentSection id="accounts" title="2. Accounts and organizations">
      <DocumentList>
        <li>You must provide an accurate email address and protect your password, sessions, API keys, provider credentials, and invitation links.</li>
        <li>You are responsible for activity performed through your account and for assigning appropriate organization roles.</li>
        <li>You may upload or connect data only when you are authorized to process it and to share it with Vera and any provider you configure.</li>
        <li>Notify the service operator promptly if you believe an account, secret, or integration has been compromised.</li>
      </DocumentList>
    </DocumentSection>
    <DocumentSection id="use" title="3. Acceptable use">
      <p>You may use Vera to audit, reconcile, investigate, and document legitimate payment activity. You must not:</p>
      <DocumentList>
        <li>break applicable law, payment-network rules, sanctions, or third-party rights;</li>
        <li>upload stolen, deceptive, malicious, or unlawfully obtained data;</li>
        <li>probe, bypass, or interfere with authentication, tenant isolation, rate limits, signatures, or security controls;</li>
        <li>use the service to process card numbers, CVVs, OTPs, or other authentication secrets outside the intended Razorpay Checkout flow;</li>
        <li>misrepresent a Vera report as a regulatory certification, bank confirmation, or professional audit opinion.</li>
      </DocumentList>
    </DocumentSection>
    <DocumentSection id="data" title="4. Your data and permissions">
      <p>You retain your rights in records, evidence, and configuration you provide. You grant the service operator a limited permission to host, secure, transform, transmit, verify, back up, and display that data solely to operate Vera, protect the service, and comply with law.</p>
      <p>You are responsible for the accuracy, lawfulness, retention, and disclosure of your data. Organization members can access shared workspace data according to their assigned roles.</p>
    </DocumentSection>
    <DocumentSection id="third-parties" title="5. Third-party services">
      <p>Vera can connect to Razorpay, RazorpayX, Anthropic, OpenAI-compatible providers, Slack, and Discord. Those services operate under their own terms and privacy practices. You choose whether to connect them and are responsible for your provider accounts, fees, settings, and permissions.</p>
    </DocumentSection>
    <DocumentSection id="risk" title="6. Financial and AI limitations">
      <DocumentCallout title="Vera is not a bank or professional adviser">Vera does not move or custody funds, provide accounting, tax, legal, investment, or audit advice, or guarantee recovery of money. Verify material decisions with source systems and qualified professionals.</DocumentCallout>
      <p>AI output is investigative assistance, not evidence. Vera independently checks model proposals, but software defects, incomplete source data, provider outages, configuration mistakes, and novel fraud patterns can still produce incomplete or incorrect results.</p>
    </DocumentSection>
    <DocumentSection id="availability" title="7. Service changes and availability">
      <p>The hosted service may change, be suspended, or be discontinued. Maintenance, provider outages, abuse prevention, security incidents, and resource limits can affect availability. No uptime or support commitment exists unless separately agreed in writing.</p>
    </DocumentSection>
    <DocumentSection id="liability" title="8. Disclaimers and liability">
      <p>To the maximum extent permitted by law, the hosted service is provided “as is” and “as available,” without warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, uninterrupted operation, or loss prevention.</p>
      <p>To the maximum extent permitted by law, the operator and contributors are not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost data, business interruption, payment losses, or third-party claims arising from the service. Where liability cannot be excluded, aggregate liability is limited to the amount you paid for this hosted service during the twelve months before the claim. Nothing here excludes liability that applicable law does not allow to be excluded.</p>
    </DocumentSection>
    <DocumentSection id="termination" title="9. Suspension and termination">
      <p>You may stop using the service at any time. The operator may restrict or terminate access for material breach, unlawful use, security risk, non-payment under a separate agreement, or to protect other users and the service. Data handling after termination follows the <DocumentLink href="/privacy#retention">retention section</DocumentLink> of the Privacy Policy.</p>
    </DocumentSection>
    <DocumentSection id="law" title="10. Governing law">
      <p>These Terms are governed by the laws of India, without regard to conflict-of-law principles. Courts with jurisdiction over the operator’s principal place of business will have exclusive jurisdiction, unless mandatory law requires another forum. Mandatory consumer protections remain unaffected.</p>
    </DocumentSection>
    <DocumentSection id="contact" title="11. Changes and contact">
      <p>Material changes will be published here with a revised date. Continued use after a change takes effect constitutes acceptance where permitted by law.</p>
      <p>For service or legal questions, contact the maintainer through the <a href={REPOSITORY_URL} className="font-medium text-brand hover:underline">Vera repository</a>. Do not publish passwords, API keys, payment evidence, or personal data in a public issue.</p>
    </DocumentSection>
  </PublicDocument>;
}

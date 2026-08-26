# Security model

## Installation trust root

On first use Vera atomically creates `data/.master_key` with restrictive filesystem permissions. It is used as the root for:

- HMAC protection of sessions and integration API keys.
- AES-256-GCM encryption of Razorpay and AI provider credentials.
- Encryption of the installation's persistent Ed25519 private signing key.
- Encryption of workspace principal and merchant Ed25519 keys used by the web-managed verified-purchase flow.

The installation owner can create a portable recovery backup in Settings. Vera checkpoints SQLite, packages the database and installation key, encrypts the package with AES-256-GCM using a passphrase-derived scrypt key, and records creation and verification in an audit log. Vera never stores the passphrase. Keep the backup and passphrase separately. Anyone who obtains both can decrypt integration credentials. Losing both the installation key and every recovery backup makes encrypted credentials unrecoverable.

## Network deployment

- Put Vera behind a TLS-terminating reverse proxy.
- Set the canonical HTTPS public URL in Settings.
- Preserve `Host`, `X-Forwarded-Host`, and `X-Forwarded-Proto` accurately.
- Do not publish the `data/` directory.
- Restrict filesystem access and encrypt the host volume.
- Keep the container root filesystem read-only and persist only `/app/data`; the supplied Compose file does both.

Session cookies are `HttpOnly`, `SameSite=Lax`, and marked `Secure` when the request arrives through HTTPS. Cookie-authenticated mutations enforce same-origin requests. API-key requests use bearer authentication.

Account registration remains available after initialization. Every account receives a private organization; owners and admins can issue seven-day, email-bound invitation links to shared organizations. Organization roles are owner, admin, operator, auditor, and viewer. Read, operate, review, integration-management, and member-management permissions are enforced in server routes. The first account also receives the single installation-owner role for global settings.

## Razorpay

- Test keys are accepted by default.
- Live keys require an explicit installation-owner setting.
- Webhook signatures are checked over the raw body using constant-time HMAC comparison.
- Checkout signatures are verified and payments are fetched again from Razorpay; browser-supplied amounts are not trusted.
- Mandate and cart attestations are persisted before the Razorpay order is created and later bound by order ID and immutable hashes.
- Test mode never fabricates settlement or bank evidence.
- RazorpayX account numbers are encrypted. Imported transactions are deduplicated and only uniquely matched credits become bank evidence.

## Master-key rotation

The installation owner must create and verify an encrypted recovery backup within 24 hours before rotation. Vera stages a new key while retaining the old key for crash recovery, re-encrypts every provider, signing, chat, and bank-feed secret in one database transaction, revokes sessions, API keys, and pending invitation tokens, and only then removes the old key. Follow the exact operator checklist in [OPERATIONS.md](OPERATIONS.md).

## Ledger integrity

Models are proposers, never mutators. The verifier replays evidence and independently derives each decision. Human reviewers can acknowledge exceptions but cannot rewrite claims.

Version 2 bundles embed attached source files and bind their SHA-256 hashes, the canonical world hash, and the event-chain head into one signed digest. Verification checks artifact bytes, chain integrity, world hash, signature, deterministic replay, and whether the signer matches the installation public key.

## Operational limits

SQLite is appropriate for a single self-hosted Vera instance with a persistent volume. Do not run multiple application replicas against the same SQLite file over a network filesystem. Use the encrypted backup control in Settings and verify every backup before relying on it. Recovery intentionally remains an offline operator action so a compromised browser session cannot replace the live installation database.

# Security model

## Installation trust root

On first use Vera atomically creates `data/.master_key` with restrictive filesystem permissions. It is used as the root for:

- HMAC protection of sessions and integration API keys.
- AES-256-GCM encryption of Razorpay and AI provider credentials.
- Encryption of the installation's persistent Ed25519 private signing key.

Back up `data/.master_key` and `data/vera.db` together. Anyone who obtains both can decrypt integration credentials. Losing the master key makes encrypted credentials unrecoverable.

## Network deployment

- Put Vera behind a TLS-terminating reverse proxy.
- Set the canonical HTTPS public URL in Settings.
- Preserve `Host`, `X-Forwarded-Host`, and `X-Forwarded-Proto` accurately.
- Do not publish the `data/` directory.
- Restrict filesystem access and encrypt the host volume.
- Keep the container root filesystem read-only and persist only `/app/data`; the supplied Compose file does both.

Session cookies are `HttpOnly`, `SameSite=Lax`, and marked `Secure` when the request arrives through HTTPS. Cookie-authenticated mutations enforce same-origin requests. API-key requests use bearer authentication.

Account registration remains available after initialization. The first account receives the single installation-owner role; later accounts are members. Workspace records, credentials, API keys, sessions, reviews, and webhooks are scoped by authenticated user ID. Only the owner can change installation-wide settings such as the canonical URL, storage limit, and live-payment opt-in.

## Razorpay

- Test keys are accepted by default.
- Live keys require an explicit installation-owner setting.
- Webhook signatures are checked over the raw body using constant-time HMAC comparison.
- Checkout signatures are verified and payments are fetched again from Razorpay; browser-supplied amounts are not trusted.

## Ledger integrity

Models are proposers, never mutators. The verifier replays evidence and independently derives each decision. Human reviewers can acknowledge exceptions but cannot rewrite claims.

Bundles are hash-chained and signed by a stable installation identity. Verification checks chain integrity, world hash, signature, deterministic replay, and whether the signer matches the installation public key.

## Operational limits

SQLite is appropriate for a single self-hosted Vera instance with a persistent volume. Do not run multiple application replicas against the same SQLite file over a network filesystem. Back up using SQLite-aware snapshots and test restoration regularly.

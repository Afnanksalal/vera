# Integration API

Browser requests use the secure session cookie. Server integrations use an API key created in `/app/settings`:

```http
Authorization: Bearer vera_...
Content-Type: application/json
```

Cookie-authenticated mutations require a same-origin `Origin` or `Referer`. Bearer-authenticated requests are not subject to browser CSRF checks.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/auth/me` | Current authenticated user |
| `POST` | `/api/v1/ingest` | Ingest `{ "records": [...] }` |
| `POST` | `/api/v1/close` | Close all current workspace records |
| `GET` | `/api/v1/ledger` | Latest close and claim grid |
| `GET` | `/api/v1/closes` | Close history; add `latest=1` for latest details |
| `GET` | `/api/v1/closes/:id?download=bundle` | Download a signed bundle |
| `GET` | `/api/v1/reviews?status=open` | Review queue |
| `POST` | `/api/v1/reviews/:id/ack` | Acknowledge with optional `{ "note": "..." }` |
| `GET`/`POST` | `/api/v1/analysis` | Run deterministic or `{ "ai": true }` analysis |
| `GET`/`POST`/`DELETE` | `/api/v1/calibration` | Manage labelled selective-risk calibration rows |
| `POST` | `/api/investigate` | Investigate one real `{ "sale_id": "..." }` |
| `POST` | `/api/v1/verify-bundle` | Verify an uploaded bundle and trusted signer |
| `GET` | `/api/v1/public-key` | Installation audit public key |
| `GET`/`POST` | `/api/v1/keys` | List or create integration keys |
| `DELETE` | `/api/v1/keys/:id` | Revoke an integration key |
| `GET`/`PUT` | `/api/v1/razorpay` | Inspect or connect Razorpay |
| `POST` | `/api/v1/razorpay/sync` | Import captured payments |
| `POST` | `/api/webhooks/razorpay/:userId` | Signature-verified Razorpay webhook |

Ingest requests accept at most 200 records and 1 MB per request. Account storage defaults to 100,000 events and the installation owner can set 1,000–1,000,000 from Settings. Monetary fields are integer paise.

Mandate imports may provide `ap2_intent.signature` and `ap2_intent.public_key_pem`, plus `ap2_cart.cart_hash`, `ap2_cart.merchant_signature`, and `ap2_cart.merchant_public_key_pem`. Vera verifies Ed25519 signatures over its canonical payload. Missing attestations remain invalid; the adapter never generates signatures, settlements, receipts, or bank credits for an integration.

Settlement imports accept `gross_minor`, `fee_minor`, `tax_minor`, and `net_minor`. The verifier requires the captured payment to equal gross and requires `gross_minor - fee_minor - tax_minor = net_minor`. For backward compatibility, omitted gross defaults to the payment amount and omitted fee/tax default to zero.

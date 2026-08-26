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
| `GET`/`POST` | `/api/v1/purchases` | List or create a pre-payment signed purchase session |
| `POST` | `/api/v1/evidence` | Attach a processor report or bank statement and re-close |
| `POST` | `/api/v1/evidence/bank-csv` | Validate and attach up to 200 bank rows from one CSV source |
| `GET` | `/api/v1/operations` | Read tenant-scoped delivery, audit, queue, and integrity status |
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

`POST /api/v1/purchases` accepts principal and agent DIDs, merchant ID, category, SKU, quantity, unit amount, mandate budget, and validity. Vera creates and persists real Ed25519 mandate and cart attestations before it creates the Razorpay order. The order carries only Vera purchase and evidence hashes; the complete artifacts remain in Vera rather than being squeezed into Razorpay notes.

`POST /api/v1/evidence` requires the original source file as base64 (maximum 1 MB) plus the selected settlement or bank row. Vera computes the file hash server-side, stores the original bytes, updates the payment record, and creates a new signed report. Processor rows must satisfy gross minus fee and tax equals net. Bank matching uses settlement net, date window, UTR, and mandate reference.

`POST /api/v1/evidence/bank-csv` accepts the original CSV as base64 (maximum 1 MB). Required columns are `payment_id`, `bank_id`, `amount`, `date`, `narration`, and `utr`; `intent_ref` is optional. Every payment must already belong to the authenticated workspace. The import is transactional and the original file is retained once.

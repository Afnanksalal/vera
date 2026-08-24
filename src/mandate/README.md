# Verification engine

`src/mandate` is Vera's framework-independent trust engine. Production calls it through `src/server`; it has no command-line entry point and no environment configuration.

- `adapters.ts`: normalize AP2, ACP, x402, and Razorpay-derived records.
- `tools.ts`: pure evidence lookups.
- `agent.ts`: optional model investigator.
- `challenger.ts`: replay evidence and challenge inconsistent proposals.
- `verifier.ts`: sole claim-status mutator.
- `orchestrate.ts`: close pipeline.
- `matching/`: subset-sum reconciliation and independent assignment verification.
- `anomaly.ts`: constrained rule DSL and validation.
- `audit.ts` / `bundle.ts`: hash chaining, signing, and deterministic replay.

Generated fixtures, answer keys, and calibration datasets exist only to exercise the engine in automated tests. Runtime application code must always construct a world from persisted workspace records.

## Why per-sale amount matching is not enough

A bank credit cannot prove who authorized a purchase. A captured payment may have no durable receipt, a mandate may have expired before capture, a retry may have charged twice, and one bank credit may combine multiple settlement units. These failures are invisible to a simple join on amount and date.

The engine therefore works in typed claims with reproducible evidence rather than assigning a single opaque status to a sale.

## The seven claims

| Claim | Proven when | Exception on failure |
| --- | --- | --- |
| `AUTHORIZED` | Intent attestation is present and valid; cart is within budget, category, and time | `MANDATE_ATTESTATION_MISSING`, `MANDATE_ATTESTATION_INVALID`, `MANDATE_OVERSPEND`, `MANDATE_EXPIRED` |
| `CART_BOUND` | Merchant attestation is present and valid, cart hash and line total recompute, and payment equals the cart total | `CART_ATTESTATION_MISSING`, `CART_ATTESTATION_INVALID`, `CART_PAYMENT_MISMATCH` |
| `RECEIPTED` | A durable receipt exists | `RECEIPT_ABSENT` |
| `IDEMPOTENT` | One payment exists per idempotency key | `RETRY_DOUBLE_BOOK` |
| `SETTLED` | A real settlement exists and gross − fees − tax equals net | `SETTLEMENT_ABSENT`, `SETTLEMENT_DRIFT` |
| `BANKED` | Real bank credits reconcile to settlement units | `BANK_CREDIT_ABSENT`, `CHANNEL_UNTAGGED` |
| `REFUND_POLICY` | Refunds retain mandate provenance and do not collide | `ORPHAN_REFUND`, `DOUBLE_REFUND` |

## Roles and mutation boundary

- **Investigator** (`closer.ts`, `planner.ts`, `agent.ts`): gathers evidence through pure tools and emits a proposal containing tool arguments, result hashes, and cited row identifiers. It cannot set claim state.
- **Challenger** (`challenger.ts`): reruns every cited tool and independently derives the expected decision. It rejects stale, altered, missing, or contradictory evidence.
- **Verifier** (`verifier.ts`): the sole claim mutator. It requires transcript membership, matching hashes, existing cited rows, no open challenge, and agreement with `decide.ts`.
- **Audit and bundle** (`audit.ts`, `bundle.ts`): hash-chain the execution and export a canonical replayable close. The server supplies the installation's persistent signer.

`tools.ts` contains pure functions over the canonical world. A miss returns no row rather than a guessed substitute.

## Protocol adapters

`adapters.ts` normalizes AP2, ACP, x402, and Razorpay-derived records. External intent and cart attestations may carry Ed25519 public keys and signatures. Internal test fixtures can use deterministic HMAC attestations to exercise the same verification boundary.

Adapters are truth preserving:

- Missing mandate budgets do not default to the payment amount.
- Payment capture does not imply a receipt unless a real receipt reference exists.
- Settlement and bank rows are emitted only when the input contains those records.
- Signatures and hashes are never manufactured for production ingestion.

## Matching, calibration, and anomalies

1. **Combinatorial matching** (`matching/`) treats a bank credit as a possible sum of multiple settlement units. The solver enumerates candidates, while `verifyAssignment` enforces sums, date windows, known identifiers, and no reuse.
2. **Selective risk control** (`conformal.ts`, `matching/riskcontrol.ts`) derives an acceptance threshold and Clopper-Pearson error bound from labelled historical outcomes supplied by the operator. Runtime code never substitutes synthetic calibration data.
3. **Open-world anomaly validation** (`anomaly.ts`) executes proposed rules in a constrained language. Valid findings are routed to human review and do not automatically perform financial actions.

## Determinism and tests

The engine remains framework independent. Automated tests cover canonicalization, adapters, tool lookup, proposal acceptance and rejection, challenge replay, matching verification, calibration guarantees, anomaly validation, chain tampering, signature verification, and bundle replay.

Run the engine test suite from the repository root with `npm test`. Fixture and evaluation modules are test support; they are not imported by the Next.js runtime.

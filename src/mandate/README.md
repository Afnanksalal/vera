# Engine reference

The `mandate` directory is the reconciliation engine. It has no framework dependencies and runs from the command line, from the web app, or from tests. It closes the books on agent-originated sales, where the objects that describe one purchase (an intent mandate, a signed cart, a payment token, an order, a settlement, and a bank credit) share no single join key.

The unit of work is a typed claim. Closing the books means proving or flagging every claim with evidence that a second, independent pass can reproduce.

## Why per-sale amount matching is not enough

A bank credit cannot tell an agent sale from a human one. An x402 payment often arrives with no durable receipt. A mandate can be overspent or expired after the fact. None of these are visible to a match on amount and date. The `naive` baseline in `eval` does exactly that match and misses 26 of 28 planted faults; the claim ledger catches all 28.

## The seven claims

| Claim | Proven when | Exception on failure |
| --- | --- | --- |
| `AUTHORIZED` | intent signature valid, cart within budget, category, and time | `MANDATE_OVERSPEND`, `MANDATE_EXPIRED` |
| `CART_BOUND` | merchant signature valid, cart hash recomputes, payment equals cart total | `CART_PAYMENT_MISMATCH` |
| `RECEIPTED` | a stored receipt exists | `RECEIPT_ABSENT` |
| `IDEMPOTENT` | one payment per idempotency key | `RETRY_DOUBLE_BOOK` |
| `SETTLED` | settlement net equals payment amount | `SETTLEMENT_DRIFT` |
| `BANKED` | exactly one bank credit tagged to the intent | `CHANNEL_UNTAGGED` |
| `REFUND_POLICY` | refunds carry a mandate reference and do not collide | `ORPHAN_REFUND`, `DOUBLE_REFUND` |

## Roles

The investigator can be a language model or a deterministic policy. The verifier is deterministic and is the only component that trusts nothing. Amounts never come from generated text.

- Investigator: either the deterministic closer (`closer.ts`, `planner.ts`) or the model agent (`agent.ts`, `llm.ts`). The model agent is a tool-use loop: it calls the same read tools to gather evidence, then calls `submit_verdict`. Both emit a proposal with evidence (tool, arguments, result hash, cited row ids), and neither can set a claim's status. Anthropic is used when `ANTHROPIC_API_KEY` is set; an OpenAI-compatible endpoint is used when `OPENAI_API_KEY` is set.
- Challenger (`challenger.ts`): re-runs every cited tool from scratch to catch tampering, and re-derives the decision to catch a proposal that disagrees with the data.
- Verifier (`verifier.ts`): the only mutator. It accepts a proposal only when the evidence is in the transcript, the hashes match a fresh tool run, the cited rows exist, no challenge is open, and the action agrees with an independent re-derivation in `decide.ts`. Otherwise the claim stays open and is abstained.
- Audit (`audit.ts`, `bundle.ts`): the run is hash-chained and the head is signed into a bundle that anyone can verify without trusting the process that produced it.

`tools.ts` are pure functions over the world. They return rows, never prose, and return empty on a miss rather than guessing.

## Three layers beyond the typed claims

1. Combinatorial matching (`matching/`). One lumped bank credit is the sum of several settlements within a tolerance, so matching is a subset-sum problem. `solver.ts` enumerates feasible groupings, and `verifyAssignment` checks a proposed assignment for exact sums, date windows, and no reuse. `reconcile.ts` runs a deterministic constraint-propagation solver and a model-guided proposer that share the same verifier. The fixture plants a group larger than the solver's search cap, so only the model recovers it, and the solver still confirms the exact sum.
2. Conformal risk control (`conformal.ts`, `matching/riskcontrol.ts`). A fallible matcher assigns each match a confidence score. Split-conformal calibration selects the largest acceptance threshold whose Clopper-Pearson upper bound on the accepted-error rate stays at or below a target, with confidence 1 minus delta. Accepted matches carry that bound; the rest are abstained to a human queue.
3. Open-world anomaly synthesis (`anomaly.ts`). Some risks are patterns across sales that each pass every claim, for example one agent splitting spend into several carts just under its cap within a window. A proposer (a model or a deterministic grid search) writes a rule in a small, fixed language; the rule is executed and validated for coverage and coherence; accepted findings are routed to human review and never actioned automatically.

## Supporting parts

- Planner seam (`planner.ts`): the closer is driven by a swappable planner, so a model can choose tools without touching the verifier. `ReorderingPlanner` shows that verdicts do not depend on plan order.
- Protocol adapters (`adapters.ts`, `examples.ts`): normalize AP2, ACP, and x402 payloads into the canonical, signed world and close them the same way as the fixture.
- Tamper-evident trail (`audit.ts`): every tool call and verdict is hash-chained, and the first altered entry is reported.
- Signed bundle (`bundle.ts`): a self-contained export of the world, the committed claims, the chain, and an ed25519 signature over the head. `verifyBundle` re-checks the chain, the signature, the world hash, and replays the close.

## Run it

```bash
npm test                          # engine tests
npm run mandate:eval              # score against the answer key, exit non-zero on failure
npm run mandate close --seed 42
npm run mandate show --sale sale_000
npm run mandate ingest            # close the AP2, ACP, and x402 example records
npm run mandate match             # N:1 reconciliation, solver verified
npm run mandate match --llm       # model-guided matching, recovers the large group
npm run mandate risk              # conformal risk-controlled match rate
npm run mandate anomaly           # open-world anomaly discovery
npm run mandate anomaly --llm     # model proposes an anomaly rule, then it is validated
npm run mandate bundle            # export a signed audit bundle
npm run mandate verify-bundle     # re-check chain, signature, and replay
npm run mandate fixture:build     # dump fixture.json and answer-key.json
```

## Evaluation on seed 42

- Claims processed at least 50 (currently 420).
- Sale-claim closure at least 95 percent (currently 100).
- Planted-fault recall 100 percent (28 of 28, correct code).
- False prove equals 0 (a broken mandate is never proven).
- Also reported: the naive baseline misses 26 and catches 2, plus tool calls at p50 and p95.

The fixture is generated from a seed with configurable plant counts, and the answer key is derived at generation time, not by running the system against itself. The eval passes on seeds 1, 7, 42, 100, and 2026.

## References

- The Agent Payments Protocol (AP2) mandate chain and the intent id as a join key.
- x402 gaps that motivate the receipt and idempotency claims.
- The Subset-Sum Matching Problem for lumped reconciliation.
- Neuro-symbolic verification, where a model proposes and a checker decides.
- Split-conformal selective prediction for the accept-or-abstain guarantee.

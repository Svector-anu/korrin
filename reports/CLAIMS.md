# Claims ledger

Every public claim Korrin makes, with the evidence behind it. If a claim isn't marked Verified, we don't make it.

| Claim | Status | Evidence |
|---|---|---|
| Korrin places real native flip orders on Tempo's Stablecoin DEX | **Verified** | `LIVE_RUN.md` runs 1–6, explorer links |
| Placement counts only after independent `getOrder` readback | **Verified** | `src/lib/client/execute.ts`, run 5 |
| Cancellation counts only after `getOrder` reverts `OrderDoesNotExist` | **Verified** | runs 1–6 |
| A filled flip order keeps its order ID and swaps sides (TIP-1056 behaviour on Moderato) | **Verified** | runs 2 and 6, orders 18439167 and 18439345 |
| Cancel refunds escrow to the DEX balance, and withdraw is a separate step | **Verified** | `SPONSOR_FINDINGS.md`, run 6 |
| The planner abstains on stale data, wrong chain, paused tokens, unreadable balances, unreconciled orders and an out-of-band market | **Verified** | `src/lib/policy/plan.test.ts` (19 planner cases) |
| The server never signs | **Verified by construction** | Every `src/app/api/*` route is a read. Signing exists only in `src/lib/client` |
| Liquidity Health Reports separate own verified depth from external depth, never double count, report unreadable levels as null with a lower bound, and are deterministic and tamper-evident | **Verified** | `src/lib/health/health.test.ts` (23 cases), live reads on BetaUSD with 13 to 14 of 20 levels unreadable |
| Report coverage agrees with the v1 planner for the same observation | **Verified** | `health.test.ts`, "agrees with the v1 planner" |
| What-if simulation never changes the saved plan | **Verified** | `health.test.ts` and `analyst.test.ts`; saving a version is a separate confirmed step |
| Korrin Analyst only states numbers present in the report, and falls back to the deterministic answer otherwise | **Verified** | `src/lib/analyst/analyst.test.ts`; `scripts/analyst-check.ts` ran 5 cases over recorded frames on local and production, all passed validation, including a request for profit and APY that it declined |
| The analyst has no wallet, signing or chain tools | **Verified by construction** | `src/app/v1/analyst/explain/route.ts` only reads the posted context and re-runs pure functions |
| Read-only MCP tools serve the same reports, and private plans are never exposed | **Verified** | `scripts/mcp-check.ts` against production: 7 tools, all read-only; the paid tool refuses without an entitlement; `get_mandate_status` always refuses |
| A paid MPP report on testnet: challenge, verified payment, receipt, retrieval without a second charge | **Pending** | Implemented in `src/app/v1/intelligence` and `src/lib/server/mpp.ts`, with `scripts/mpp-buy-report.ts` as the proof. Not run yet: the shared Upstash store is not provisioned, so the route returns `PAYMENT_NOT_CONFIGURED` |
| x402 adapter | **Not built** | Deferred until MPP is verified, per PRD v2 §9 |
| Browser wallets (MetaMask, Rabby) can sign Korrin orders on Moderato | **Not verified** | Wired through RainbowKit with standard transactions. No injected wallet was tested in this environment. The browser testnet signer is the verified path |
| `FlipFailed` is handled correctly | **Not observed** | Decoded and shown in the timeline, but never emitted during our runs |
| Coverage-directed quoting keeps more in-band depth than a static order | **Unproven** | No controlled comparison has run |
| Market operators want this | **Hypothesis** | No customer conversations yet |
| Safe for real funds | **Not claimed** | No audit, testnet only |

Fills in runs 2 and 6 came from a second testnet account Korrin controls. They show protocol behaviour, not market demand.

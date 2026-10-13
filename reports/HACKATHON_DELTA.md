# Prior work disclosure

**Earlier work.** In February 2026 the same builder entered TempoVault in a Tempo hackathon: an "institutional treasury" design with a custom orderbook interface, a pooled vault, a risk controller, a lending module and reporting contracts (public repo: https://github.com/winsznx/tempovault). Judges credited its use of the DEX, flip orders and TIP-20, found the UX mediocre, and did not see it as one of the most novel entries.

**What carried over.** Ideas only: liquidity on Tempo's native DEX, flip orders, risk limits and a stale-data refusal. A list of February's security issues was used as a threat checklist for tests.

**What was rebuilt from scratch in October 2026.** Everything in this repository:

- The product object is new: a Liquidity Mandate (corridor, depth targets, capital and risk limits, policy digest) instead of a pooled vault.
- The DEX integration uses the maintained `viem/tempo` actions against the real `IStablecoinDEX` precompile. February's custom `ITempoOrderbook` ABI is not used.
- A pure, tested planner that proposes one bounded action or explains why it holds.
- Same-ID flip lifecycle tracking and readback-confirmed state.
- No custody contract, no lending, no performance fees.
- The whole UI, the design system, the live session capture and replay, and the evidence ledger.

No TempoVault code, contract or ABI is imported, copied or ported. The git history of this repository starts on 2026-10-12.

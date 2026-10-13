# Live runs on Tempo Moderato testnet

Raw step-by-step records with timings live in `reports/live-runs/*.json`. Explorer: https://explore.testnet.tempo.xyz

Signer: `0x5C4d371C64FC0D6f82d6E7d19597ddd23a91267B`. It's a key generated for this project, funded only by the testnet faucet and kept in a gitignored `.env.local`.

## Run 1 · 2026-10-12 00:51 UTC · place → readback → cancel → verify

| Step | Evidence |
|---|---|
| Pair | BetaUSD (`0x20c0…0002`) / PathUSD (`0x20c0…0000`), book key `0x1d4a3d25…5681d32` |
| Observed book | best bid tick −10, best ask tick 10 |
| `placeFlip` | bid 100 BetaUSD at tick −30 (0.9997), flipTick 30 (1.0003) |
| Tx | [`0x919ec02287fde234b1440d1fd2b80de524c0574a77c4d9348c2e92677668bc49`](https://explore.testnet.tempo.xyz/tx/0x919ec02287fde234b1440d1fd2b80de524c0574a77c4d9348c2e92677668bc49) |
| Included | block 39202854, status success, 1.06 s after submission |
| Native order ID | **18439158**, from the `OrderPlaced` log (logIndex 8, `isFlipOrder: true`) |
| Independent readback | `getOrder(18439158)` at the inclusion block and at latest: maker, isBid, tick −30, flipTick 30, isFlip, remaining 100.000000 all matched |
| Escrow | wallet PathUSD fell by 99.97 plus fee |
| `cancel` | [`0x094c5655bfc2d273f3ad6b3a94d9c1fab3d883bbcbc10c6e13d3026d9a2a3ac7`](https://explore.testnet.tempo.xyz/tx/0x094c5655bfc2d273f3ad6b3a94d9c1fab3d883bbcbc10c6e13d3026d9a2a3ac7), block 39202860, `OrderCancelled(18439158)` |
| Postcondition | `getOrder(18439158)` reverts `OrderDoesNotExist` |
| Refund location | DEX internal balance 99.97 PathUSD, wallet unchanged until `withdraw` |

## Run 2 · 2026-10-12 00:56 UTC · TIP-1056 flip lifecycle, same order ID across two flips

The fills in this run came from a second testnet account that Korrin controls (`0x6D55bFF029Aa298cAf87947A9E3F684547C0fC66`). This is self-generated flow to exercise protocol behaviour. It isn't external market demand, and the product labels it that way wherever it's shown.

| Step | Evidence |
|---|---|
| Pair | AlphaUSD (`0x20c0…0001`) / PathUSD, book key `0x3bfd5cdc…633e8dfe`, observed best bid 480, best ask 600 |
| `placeFlip` | bid 100 AlphaUSD at tick 490 (1.0049), flipTick 590 (1.0059). Tx [`0xa2498e53…`](https://explore.testnet.tempo.xyz/tx/0xa2498e5310ba427ba723bebc6d1603b2052798b98bacaf3a33d1fd25d5523fe2), block 39203179, order ID **18439167** |
| Taker sells 100 AlphaUSD | tx [`0x36b19a93…`](https://explore.testnet.tempo.xyz/tx/0x36b19a933cd0be1014ce0a39fa0df8eb5797f3d9237aaa87a30e379f53fa257a), block 39203181, logs `OrderFilled(18439167)` then `OrderFlipped(18439167)` |
| Readback after flip 1 | `getOrder(18439167)`: isBid false, tick 590, flipTick 490, remaining 100. Same ID, side swapped |
| Taker buys 100 AlphaUSD | tx [`0x57a108a5…`](https://explore.testnet.tempo.xyz/tx/0x57a108a513c304c7a66ce3e3c596c17db0235bff92d3297efac3053df12e7d7b), block 39203183, `OrderFilled` + `OrderFlipped` |
| Readback after flip 2 | isBid true, tick 490, flipTick 590. Same ID 18439167 |
| `cancel` | tx [`0x01e00110…`](https://explore.testnet.tempo.xyz/tx/0x01e0011028b5b97e66925df92a4866a4a07d7fbe3d07a702ac9b7a08930f9aed), block 39203187, `OrderCancelled(18439167)`, then `getOrder` reverts |

What this establishes on Moderato: a filled flip order emits `OrderFilled` and `OrderFlipped` in the same transaction, keeps its order ID, and swaps `tick`/`flipTick` and side. No replacement `OrderPlaced` is emitted. `FlipFailed` has not been observed yet.

## Runs 3 and 4 · 2026-10-12 00:57 and 01:00 UTC · calibration

Two more place → readback → cancel → verify runs: one bid (order 18439173) and one ask (order 18439176) on BetaUSD/PathUSD. Timings are in `SPONSOR_BEHAVIOUR.md`.

## Run 5 · 2026-10-12 01:55 UTC · the full product path in a browser

`scripts/e2e-live.ts` drove the deployed UI in Chromium. It created a browser testnet signer, funded it from the faucet, built a BetaUSD/PathUSD mandate in the three-step builder, and signed the first proposal from the review modal.

- Order **18439342**: the modal reached Confirmed after `getOrder(18439342)` at block 39209025 returned bid, tick −30, remaining 250. Submission to confirmed readback took 2.87 s.
- Cancel through the orders table was confirmed when `getOrder(18439342)` reverted `OrderDoesNotExist` at block 39209056.
- An earlier attempt failed with the public RPC's `rate limited` error, and the UI showed it as a failed submission with the exact reason. Browser RPC clients now retry with backoff.

## Run 6 · 2026-10-12 02:00 UTC · captured session used by the no-wallet replay

`scripts/capture-session.ts` ran a mandate on AlphaUSD/PathUSD (target 1.0054 ± 10 bp) and recorded, at every step, the book levels, the planner's decision, `getOrder` readback and balances. The output is `src/lib/evidence/session.generated.json`, which drives `/app/session` and the landing page. The fills came from Korrin's own second test account.

| Step | Tx | Block |
|---|---|---|
| placeFlip bid 100 AlphaUSD at 1.0050, flip 1.0058, order **18439345** | [`0xd658f11b…`](https://explore.testnet.tempo.xyz/tx/0xd658f11ba89d4d4391e4d5522267974c97f46b9a5fdfc44e0fda2c089fc8794f) | 39209488 |
| Taker sells → `OrderFilled` + `OrderFlipped`. Readback shows ask at tick 580, same ID | [`0x2c962bca…`](https://explore.testnet.tempo.xyz/tx/0x2c962bca3e661c3b523f50e0387142f7f5d544c5dc1feaf04481d0d93c11f385) | 39209495 |
| Taker buys → `OrderFilled` + `OrderFlipped`. Readback shows bid at tick 500, same ID | [`0x1e53090f…`](https://explore.testnet.tempo.xyz/tx/0x1e53090f720305ec085b1f4fcf338c8caf2b28db7b6636bb780867af25e27fcf) | 39209501 |
| Operator pause (local, no transaction). Planner returns `NO_ACTION mandate_paused` | none | none |
| cancel → `OrderCancelled`, readback `OrderDoesNotExist` | [`0x4faccc32…`](https://explore.testnet.tempo.xyz/tx/0x4faccc32becc7486f7d9938f8a970859a668fbf7546081d7e0df5648bc70be36) | 39209510 |
| withdraw DEX balance to the wallet | [`0x1615f48e…`](https://explore.testnet.tempo.xyz/tx/0x1615f48e0140e923d9625e4d24c2852fcf0f31e4e6585ed79367dd90e8e25b45) | 39209516 |

## Runs 7 and 8 · 2026-10-12 06:07–06:18 UTC · recorded videos

`scripts/record-demo.ts` recorded both films against production with fresh browser signers. The recorder refuses to finish unless the dialog shows a `getOrder(` readback after placing, `OrderDoesNotExist` after cancelling, and a confirmed withdraw. Several attempts were discarded when Tempo's public RPC returned `no healthy upstreams available` or 503. The app showed those failures honestly, and no failed take was kept.

- Product demo: order **18439409** placed and confirmed by readback, cancel verified absent at block 39233943, PathUSD escrow withdrawn to the wallet.
- Pitch footage (clean take): the same flow with no captions.

## Run 9 · 2026-10-12 07:48 UTC · v1 regression check before v2 work

`scripts/live-slice.ts` re-ran the native lifecycle on BetaUSD/PathUSD with the isolated maker key, to confirm v1 still works before building v2 on top of it. Evidence: `reports/live-runs/2026-10-12T07-50-09-939Z.json`.

- placeFlip bid 100 BetaUSD at tick −30, flip tick 30, order **18439539**: [`0xaaa96354…`](https://explore.testnet.tempo.xyz/tx/0xaaa963543826a42a9d721507d58c8bddb458e5c92c970db1934402adadef4422), block 39243765. `getOrder` matched side, tick, flip tick, flip flag and remaining amount.
- cancel: [`0x417a0024…`](https://explore.testnet.tempo.xyz/tx/0x417a00244393dd418b9af11ebb719c4cdedb33ff490743c93e31e49b7cc13e7f), block 39243771, `OrderCancelled` decoded, then `getOrder` returned `OrderDoesNotExist`. The 99.97 PathUSD escrow moved to the DEX internal balance, not the wallet.
- `getTickLevel` for tick −30 was unreadable during the run ("HTTP request failed" before, "Transaction creation failed" after). Korrin reports that level as unreadable rather than empty.

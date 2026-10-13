# Videos

Both films are made from the deployed product on Tempo Moderato testnet. Nothing is mocked: the transactions shown happened on chain while the footage was recorded.

## Product demo (≤ 3 min): `media/demo/korrin-product-demo.mp4`

Recorded by `pnpm tsx scripts/record-demo.ts` against https://korrin-steel.vercel.app. The script drives Chromium, injects a visible cursor and on-screen captions, and refuses to finish if a placement, cancel or withdraw does not reach its readback, so it can never narrate a success that didn't happen.

| Time (approx.) | What is shown |
|---|---|
| 0:00 | Landing page with the captured session corridor |
| 0:09 | Live session replay at 4×: place, fill + flip under the same ID, flip back, pause, cancel, withdraw |
| 0:31 | Markets, then BetaUSD/PathUSD depth per tick (unreadable ticks marked) |
| 0:44 | Mandate builder: corridor re-plans as the half-width changes; review with policy digest and the exact first order |
| 0:58 | Browser testnet signer created. With no funds, Korrin holds and says why. The faucet funds it and the decision flips to Place bid |
| 1:22 | Review modal → sign → Submitted → Included → Verifying → Confirmed (getOrder readback) |
| 1:38 | Mandate page: the order rests at its tick, the planner proposes the ask side, plus the orders table and timeline |
| 1:56 | Pause (orders stay) → cancel → readback `OrderDoesNotExist` |
| 2:12 | Risk & controls: escrow sits in the DEX balance → withdraw to the wallet |
| 2:22 | Activity ledger, sources labelled. Close card |

## Pitch film (2–3 min): `video/pitch`

A HyperFrames composition (`video/pitch/index.html`) that follows the PRD §15.1 beat sheet: user → problem → gap → turn (Korrin) → mechanism → live proof → range → why Tempo → payoff. The product footage comes from `scripts/record-demo.ts --clean` (same real flow, no captions). Figures on screen come from real captures: the 999,899 PathUSD treasury balance and order 18439345 with its blocks are from the captured session.

Render:

```bash
pnpm tsx scripts/record-demo.ts --clean          # media/demo/korrin-clean-footage.mp4
cp media/demo/korrin-clean-footage.mp4 video/pitch/assets/footage.mp4
cd video/pitch && npx hyperframes check && npx hyperframes render
```

Disclosures shown in both films: testnet only, not audited, and the fills in the captured session came from Korrin's own second test account.

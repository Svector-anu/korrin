---
workflow: general-video
flow: automation
storyboard: no
message: "Korrin turns a stablecoin liquidity budget into live, verifiable quotes on Tempo's native orderbook."
destination: hackathon submission (YouTube unlisted / Colosseum form)
aspect: "16:9"
language: en
audience: Colosseum Crypto World's Fair judges and Tempo ecosystem reviewers
length: "2:20–2:40"
angle: problem → mechanism → live proof → responsible controls → why Tempo
---

# Korrin pitch film

## Intent

The presentation film (2–3 minutes) for the Colosseum Crypto World's Fair. It follows the beat sheet in the PRD §15.1: user, problem, gap, turn, mechanism, live proof, range, why Tempo, payoff. The product name appears by 25% of runtime and the first real product footage by 50%. No voice-over and no music. On-screen captions carry the story, so it must read with sound off.

## Assets

- Real product captures: `public/screens/mandate-{light,dark}.png` from the deployed testnet build.
- Real product footage: `media/demo/korrin-clean-footage.mp4`, recorded from production by `scripts/record-demo.ts --clean`. Every transaction in it is real on Tempo Moderato.
- Real evidence values from `src/lib/evidence/session.generated.json`: order 18439345, blocks 39209488–39209516, and the tx hashes.

## Customizations

- Korrin brand: dark canvas #0b0c0e, ink #f2f2f2, bid seafoam #4fb08f, ask blue #6b9cf0. Manrope 400/500 for display and copy, JetBrains Mono for figures.
- No invented figures, no fake charts. Any footage at changed speed gets a speed label.

## Notes

The user asked for autonomous execution without approval rounds, so the run shape is `flow: automation`, `storyboard: no`, inferred from that instruction. Disclosures in the film: testnet only, the fills in the captured session came from Korrin's own test taker, and the build is not audited.

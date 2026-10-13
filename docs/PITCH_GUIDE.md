# Pitch video guide: you on camera (about 2:00)

Goal: a judge who watches only this should know who it's for, what it does, that it really runs on Tempo, and what is honestly unproven.

## Setup (10 minutes)

- Film landscape 16:9, 1080p. Phone is fine. Camera at eye level, window light in front of you, not behind.
- Quiet room. Wired or phone-mic audio beats laptop mic.
- Record in one take per section, so a flub only costs you 20 seconds. Cut together afterwards.
- Keep `https://korrin-steel.vercel.app` open on a second screen to glance at. Do not read the script off-screen. Use the bullets, say it in your own words.
- Say numbers exactly as written. Do not round or add any.

## Beat sheet

| Time | Beat | What you say (bullets, not a script) | On screen |
|---|---|---|---|
| 0:00–0:12 | Hook + who you are | "I'm [name], from Lagos. I build on stablecoins. When a new stablecoin launches, its order book is empty, and nobody can convert it near one dollar." | You, then the empty-book line from the demo |
| 0:12–0:30 | Problem | "Today the operator places orders by hand, or runs scripts they have to watch all day. And a balance in a wallet is not liquidity. Nothing tells them whether the market they wanted actually exists." | You |
| 0:30–0:50 | Solution | "Korrin turns a liquidity budget into quotes on Tempo's native Stablecoin DEX. You set a target price, a range, depth targets, a reserve and risk limits. That's a market plan." | Demo: mandate builder |
| 0:50–1:20 | How it works | "A deterministic planner reads the live book and your balances, and proposes one bounded action. You sign it in your browser. Korrin never holds keys. The order only counts after we read it back from the chain." | Demo: sign → Submitted → Included → Verified |
| 1:20–1:40 | Proof | "This is real. Order 18439345 was placed, filled, and flipped twice under the same order ID on Tempo Moderato. Every step links to a transaction. You can replay it with no wallet." | Recorded-session replay |
| 1:40–1:52 | Why Tempo | "It uses Tempo's own primitives: TIP-20 stablecoins, the native DEX precompile, and flip orders that keep their ID. Nothing to deploy, no custody contract." | Why-Tempo card |
| 1:52–2:05 | Honest limits + ask | "It's testnet only and not audited. The fills in the recorded session came from my own second account, so that's protocol behavior, not demand. Next step is talking to the people who launch stablecoins. Try it at korrin-steel.vercel.app." | You, URL on screen |

## Lines that land (use any)

- "A balance isn't liquidity."
- "The order counts only after we read it back."
- "Execution authority stays with the owner."

## Do not say (not verified, see `reports/CLAIMS.md`)

- That it beats static orders. Unproven.
- That operators want it. Hypothesis, no customer conversations yet.
- That MetaMask or Rabby signing works. Not tested. The in-browser testnet signer is the verified path.
- That the paid API is live. Pending until Upstash is provisioned.
- Anything about profit, yield or APY.

## Delivery

- Pace: about 140 words a minute. Pause at each beat boundary.
- One idea per sentence. Cut "basically" and "kind of".
- Look at the lens on the first and last sentence, glance away freely in the middle.
- Smile on the URL.

## After filming

1. Trim to 2:00–2:20. Cut dead air, keep the real pauses.
2. Cut in screen footage from `media/demo/` over beats 3 to 6 as B-roll. Your voice continues underneath.
3. Add captions (YouTube auto-captions, then fix the numbers by hand).
4. Upload to YouTube as Unlisted. Paste that link in the Colosseum form.

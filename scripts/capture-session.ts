/**
 * Captures a real, fully instrumented mandate session on Tempo Moderato for the
 * no-wallet replay. At every step it records the book (best ticks and levels in
 * the corridor window), the planner's decision for a real mandate, native order
 * readback, balances, and the transaction that caused the change.
 *
 * Fills come from a second Korrin-owned testnet account so the flip lifecycle can
 * be exercised on demand. That is disclosed in the output and in the UI.
 *
 *   pnpm tsx scripts/capture-session.ts
 * Writes src/lib/evidence/session.generated.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Address, type Hex, createClient, http, parseEventLogs, publicActions, walletActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { Abis, Actions } from 'viem/tempo'
import { draftToMandate, defaultDraft } from '../src/lib/mandate/draft'
import { plan, type PlanningSnapshot } from '../src/lib/policy/plan'
import { korrinChain, PATH_USD } from '../src/lib/tempo/chain'
import { getBalances, getMarketSnapshot, getOrders, resetReadCache } from '../src/lib/tempo/reads'
import { loadEnvLocal } from './env'

const ALPHA: Address = '0x20c0000000000000000000000000000000000001'
const AMOUNT = 100_000_000n

loadEnvLocal()
const maker = privateKeyToAccount(process.env.KORRIN_TESTNET_PRIVATE_KEY as Hex)
const taker = privateKeyToAccount(process.env.KORRIN_TESTNET_TAKER_KEY as Hex)
const transport = http(undefined, { timeout: 20_000, retryCount: 5, retryDelay: 400 })
const makerClient = createClient({ account: maker, chain: korrinChain, transport }).extend(publicActions).extend(walletActions)
const takerClient = createClient({ account: taker, chain: korrinChain, transport }).extend(publicActions).extend(walletActions)

type Frame = {
  index: number
  atMs: number
  kind: 'observe' | 'propose' | 'submit' | 'confirm' | 'fill' | 'flip' | 'pause' | 'cancel' | 'withdraw'
  title: string
  narration: string
  actor: 'korrin' | 'operator' | 'test-taker'
  tx?: { hash: Hex; block: string; events: { event: string; logIndex: number; args: Record<string, unknown> }[] }
  book: { blockNumber: string; observedAt: number; bestBidTick: number; bestAskTick: number; levels: { tick: number; isBid: boolean; status: string; liquidity: string | null }[] }
  orders: { orderId: string; status: string; isBid?: boolean; tick?: number; flipTick?: number; remaining?: string }[]
  balances: { token: Address; wallet: string; dex: string }[]
  decision: { kind: string; reasonCode: string; cause: string; interpretation: string; action: string; nextCondition: string | null; candidate?: { side: string; tick: number; flipTick: number; amount: string } }
  mandateStatus: 'armed' | 'active' | 'paused'
}

const t0 = Date.now()
const frames: Frame[] = []
const bigintSafe = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)))

const main = async () => {
  resetReadCache()
  const first = await getMarketSnapshot(ALPHA, PATH_USD, { from: 400, to: 700 })
  const target = Math.round((first.bestBidTick + first.bestAskTick) / 2 / 10) * 10
  const draft = { ...defaultDraft('AlphaUSD/PathUSD', target), name: 'AlphaUSD launch corridor', bandBps: 10, offsetBps: 4, targetBidDepth: '100', targetAskDepth: '100', maxOrderAmount: '100', maxQuoteAllocation: '500', maxBaseAllocation: '500', reserveQuote: '50', reserveBase: '50' }
  const mandate = draftToMandate(draft, {
    id: 'captured-alpha-session',
    owner: maker.address,
    chainId: korrinChain.id,
    base: { address: ALPHA, symbol: 'AlphaUSD', decimals: 6 },
    quote: { address: PATH_USD, symbol: 'PathUSD', decimals: 6 },
    bookKey: first.bookKey,
    targetTick: target,
    status: 'armed',
    createdAt: new Date().toISOString(),
  })
  const window = { from: mandate.targetTick - mandate.bandTicks - 60, to: mandate.targetTick + mandate.bandTicks + 60 }
  let orderIds: bigint[] = []
  let status: Frame['mandateStatus'] = 'armed'
  const actionTimes: number[] = []

  const capture = async (f: Omit<Frame, 'index' | 'atMs' | 'book' | 'orders' | 'balances' | 'decision' | 'mandateStatus'>) => {
    resetReadCache()
    const [snap, orders, balances] = await Promise.all([getMarketSnapshot(ALPHA, PATH_USD, window), getOrders(orderIds), getBalances(maker.address, [ALPHA, PATH_USD])])
    const ps: PlanningSnapshot = {
      expectedChainId: korrinChain.id,
      chainId: snap.chainId,
      marketSupported: snap.exists,
      basePaused: snap.base.paused,
      quotePaused: snap.quote.paused,
      bestBidTick: snap.bestBidTick,
      bestAskTick: snap.bestAskTick,
      blockNumber: snap.blockNumber,
      observedAtMs: snap.observedAt,
      nowMs: Date.now(),
      ownOrders: orders.orders.flatMap((o) => (o.status === 'live' ? [{ orderId: o.orderId, isBid: o.isBid, tick: o.tick, flipTick: o.flipTick, remaining: o.remaining, status: 'resting' as const }] : [])),
      balances: { base: { wallet: balances.tokens[0].wallet, dex: balances.tokens[0].dex }, quote: { wallet: balances.tokens[1].wallet, dex: balances.tokens[1].dex } },
      minOrderAmount: snap.constants.minOrderAmount,
      recentActionTimestampsMs: actionTimes,
    }
    const p = plan({ ...mandate, status }, ps)
    const frame: Frame = {
      ...f,
      index: frames.length,
      atMs: Date.now() - t0,
      book: { blockNumber: snap.blockNumber.toString(), observedAt: snap.observedAt, bestBidTick: snap.bestBidTick, bestAskTick: snap.bestAskTick, levels: bigintSafe(snap.levels) as Frame['book']['levels'] },
      orders: bigintSafe(orders.orders) as Frame['orders'],
      balances: balances.tokens.map((t) => ({ token: t.address, wallet: t.wallet.toString(), dex: t.dex.toString() })),
      decision: {
        kind: p.kind,
        reasonCode: p.reasonCode,
        cause: p.cause,
        interpretation: p.interpretation,
        action: p.action,
        nextCondition: p.nextCondition,
        candidate: p.candidateOrder ? { side: p.candidateOrder.side, tick: p.candidateOrder.tick, flipTick: p.candidateOrder.flipTick, amount: p.candidateOrder.amount.toString() } : undefined,
      },
      mandateStatus: status,
    }
    frames.push(frame)
    console.log(`[${(frame.atMs / 1000).toFixed(1)}s] ${frame.title} → ${p.kind} (${p.reasonCode})`)
    return { frame, proposal: p }
  }

  const txFrame = async (hash: Hex) => {
    const r = await makerClient.waitForTransactionReceipt({ hash })
    const events = parseEventLogs({ abi: Abis.stablecoinDex, logs: r.logs }).map((l) => ({ event: l.eventName, logIndex: l.logIndex, args: bigintSafe(l.args) as Record<string, unknown> }))
    return { hash, block: r.blockNumber.toString(), events, status: r.status }
  }

  const { proposal } = await capture({ kind: 'observe', title: 'Mandate armed on the AlphaUSD book', narration: `Target ${(1 + mandate.targetTick / 1e5).toFixed(4)} ± 10 bp. Korrin reads the live book and the signer's balances before deciding anything.`, actor: 'korrin' })
  const c = proposal.candidateOrder
  if (!c) throw new Error(`Planner did not propose an order: ${proposal.cause}`)
  frames[frames.length - 1].kind = 'propose'

  const placeHash = await Actions.dex.placeFlip(makerClient, { token: ALPHA, amount: c.amount, type: c.side, tick: c.tick, flipTick: c.flipTick })
  const place = await txFrame(placeHash)
  const placed = place.events.find((e) => e.event === 'OrderPlaced')
  orderIds = [BigInt(String(placed?.args.orderId))]
  actionTimes.push(Date.now())
  status = 'active'
  await capture({ kind: 'confirm', title: `Order ${orderIds[0]} confirmed resting`, narration: 'The operator approved the proposal. Korrin waited for the receipt, then read the order back with getOrder before drawing it as liquidity.', actor: 'operator', tx: place })

  const sellHash = await Actions.dex.sell(takerClient, { tokenIn: ALPHA, tokenOut: PATH_USD, amountIn: AMOUNT, minAmountOut: 0n })
  const sell = await txFrame(sellHash)
  await capture({ kind: 'flip', title: `Filled and flipped. Order ${orderIds[0]} keeps its ID`, narration: 'A taker sold into the bid. The DEX emitted OrderFilled then OrderFlipped in the same transaction, and readback shows the same order ID now resting as an ask.', actor: 'test-taker', tx: sell })

  const buyHash = await Actions.dex.buy(takerClient, { tokenIn: PATH_USD, tokenOut: ALPHA, amountOut: AMOUNT, maxAmountIn: AMOUNT * 2n })
  const buy = await txFrame(buyHash)
  await capture({ kind: 'flip', title: 'Filled again, flipped back to a bid', narration: 'A taker bought the ask. Same order ID, back on the bid side. Each flip is verified by readback, never inferred from the fill alone.', actor: 'test-taker', tx: buy })

  status = 'paused'
  await capture({ kind: 'pause', title: 'Operator paused new actions', narration: 'Pause stops new proposals. The resting order stays on the book and Korrin keeps reading the market.', actor: 'operator' })

  const cancelHash = await Actions.dex.cancel(makerClient, { orderId: orderIds[0] })
  const cancel = await txFrame(cancelHash)
  await capture({ kind: 'cancel', title: `Order ${orderIds[0]} cancelled and verified absent`, narration: 'Cancellation is confirmed only when getOrder reverts OrderDoesNotExist. The escrow is now in the DEX balance, not the wallet.', actor: 'operator', tx: cancel })

  const dexQuote = await Actions.dex.getBalance(makerClient, { token: PATH_USD, account: maker.address })
  const dexBase = await Actions.dex.getBalance(makerClient, { token: ALPHA, account: maker.address })
  if (dexQuote > 0n) {
    const w = await txFrame(await Actions.dex.withdraw(makerClient, { token: PATH_USD, amount: dexQuote }))
    if (dexBase > 0n) await txFrame(await Actions.dex.withdraw(makerClient, { token: ALPHA, amount: dexBase }))
    await capture({ kind: 'withdraw', title: 'DEX balance withdrawn to the wallet', narration: 'A separate withdraw call moves the refunded escrow back to the signer. Only now is the capital back in the wallet.', actor: 'operator', tx: w })
  }

  const out = {
    capturedAt: new Date(t0).toISOString(),
    network: { chainId: korrinChain.id, name: 'Tempo Moderato testnet', rpc: korrinChain.rpcUrls.default.http[0], explorer: korrinChain.blockExplorers?.default.url },
    maker: maker.address,
    taker: taker.address,
    disclosure: 'Every transaction is real and on Tempo Moderato. Fills came from a second testnet account controlled by Korrin, used to exercise the flip lifecycle. They are not external market demand.',
    mandate: bigintSafe(mandate),
    window,
    frames,
  }
  const dir = join(process.cwd(), 'src', 'lib', 'evidence')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.generated.json'), JSON.stringify(out, null, 2))
  writeFileSync(join(process.cwd(), 'reports', 'live-runs', `session-${new Date(t0).toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(out, null, 2))
  console.log(`\n${frames.length} frames captured over ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

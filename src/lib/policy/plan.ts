import { type Hex, keccak256, toHex } from 'viem'
import type { LiquidityMandate } from '../mandate/types'
import { hasBestAsk, hasBestBid, isValidPlacementTick, quoteForBase, tickToPrice } from '../market/ticks'
import { formatAmount, minBigint } from '../units'

export type Side = 'buy' | 'sell'

export type OwnOrderState = {
  orderId: bigint
  isBid: boolean
  tick: number
  flipTick: number
  remaining: bigint
  /** 'unknown' means a readback failed or disagrees with the local record. */
  status: 'resting' | 'unknown'
}

export type Balances = {
  base: { wallet: bigint; dex: bigint }
  quote: { wallet: bigint; dex: bigint }
}

export type PlanningSnapshot = {
  expectedChainId: number
  chainId: number
  marketSupported: boolean
  basePaused: boolean
  quotePaused: boolean
  bestBidTick: number
  bestAskTick: number
  blockNumber: bigint
  observedAtMs: number
  nowMs: number
  ownOrders: OwnOrderState[]
  balances: Balances | null
  minOrderAmount: bigint
  recentActionTimestampsMs: number[]
}

export type ProposalKind = 'PLACE_BID' | 'PLACE_ASK' | 'KEEP' | 'CANCEL' | 'PAUSE' | 'NO_ACTION'

export type ReasonCode =
  | 'mandate_paused'
  | 'mandate_closed'
  | 'wrong_chain'
  | 'unsupported_market'
  | 'token_paused'
  | 'stale_market'
  | 'balances_unreadable'
  | 'unreconciled_order'
  | 'market_outside_band'
  | 'market_far_outside_band'
  | 'order_outside_band'
  | 'action_rate_limit'
  | 'target_met'
  | 'insufficient_free_inventory'
  | 'inventory_skew'
  | 'below_minimum'
  | 'would_cross'
  | 'invalid_tick'
  | 'depth_shortfall'

export type CandidateOrder = {
  side: Side
  amount: bigint
  tick: number
  flipTick: number
  /** Quote escrow for a bid, base escrow for an ask, in that token's units. */
  escrowToken: 'base' | 'quote'
  escrowAmount: bigint
}

export type SideCoverage = {
  target: bigint
  own: bigint
  ratio: number
  shortfall: bigint
}

export type Proposal = {
  kind: ProposalKind
  reasonCode: ReasonCode
  /** What was observed. */
  cause: string
  /** What it means for the mandate. */
  interpretation: string
  /** What Korrin proposes. */
  action: string
  /** If waiting, the condition that would change the decision. */
  nextCondition: string | null
  requiresApproval: boolean
  candidateOrder?: CandidateOrder
  cancelOrderId?: bigint
  coverage: { bid: SideCoverage; ask: SideCoverage }
  inventory: InventoryBreakdown | null
  marketObservationBlock: bigint
  inputsDigest: Hex
  expiresAtMs: number
}

export type InventoryBreakdown = {
  base: { free: bigint; committed: bigint; reserved: bigint; allocationRemaining: bigint }
  quote: { free: bigint; committed: bigint; reserved: bigint; allocationRemaining: bigint }
}

export type BandInfo = { lowTick: number; highTick: number; bidTick: number; askTick: number }

export function mandateBand(m: Pick<LiquidityMandate, 'targetTick' | 'bandTicks' | 'quoteOffsetTicks'>): BandInfo {
  return {
    lowTick: m.targetTick - m.bandTicks,
    highTick: m.targetTick + m.bandTicks,
    bidTick: m.targetTick - m.quoteOffsetTicks,
    askTick: m.targetTick + m.quoteOffsetTicks,
  }
}

export const inBand = (tick: number, band: Pick<BandInfo, 'lowTick' | 'highTick'>) => tick >= band.lowTick && tick <= band.highTick

export function coverageFor(target: bigint, own: bigint): SideCoverage {
  const ratio = target === 0n ? 1 : Math.min(1, Number((own * 10_000n) / target) / 10_000)
  return { target, own, ratio, shortfall: own >= target ? 0n : target - own }
}

/**
 * Disjoint inventory buckets per token. Wallet and DEX-internal balances are free
 * capital; resting orders are committed (already escrowed by the DEX, so never
 * part of the wallet balance); the reserve is carved out of free capital.
 */
export function computeInventory(m: LiquidityMandate, s: PlanningSnapshot): InventoryBreakdown | null {
  if (!s.balances) return null
  let committedBase = 0n
  let committedQuote = 0n
  for (const o of s.ownOrders) {
    if (o.status !== 'resting') continue
    if (o.isBid) committedQuote += quoteForBase(o.remaining, o.tick)
    else committedBase += o.remaining
  }
  const bucket = (held: bigint, reserve: bigint, committed: bigint, allocation: bigint) => {
    const reserved = minBigint(reserve, held)
    const free = held - reserved
    const allocationRemaining = allocation > committed ? allocation - committed : 0n
    return { free, committed, reserved, allocationRemaining }
  }
  return {
    base: bucket(s.balances.base.wallet + s.balances.base.dex, BigInt(m.reserveBase), committedBase, BigInt(m.maxBaseAllocation)),
    quote: bucket(s.balances.quote.wallet + s.balances.quote.dex, BigInt(m.reserveQuote), committedQuote, BigInt(m.maxQuoteAllocation)),
  }
}

export function digestInputs(m: LiquidityMandate, s: PlanningSnapshot): Hex {
  const payload = {
    policy: m.policyDigest,
    status: m.status,
    block: s.blockNumber.toString(),
    observedAt: s.observedAtMs,
    best: [s.bestBidTick, s.bestAskTick],
    orders: s.ownOrders.map((o) => [o.orderId.toString(), o.isBid, o.tick, o.remaining.toString(), o.status]),
    balances: s.balances
      ? [s.balances.base.wallet, s.balances.base.dex, s.balances.quote.wallet, s.balances.quote.dex].map(String)
      : null,
  }
  return keccak256(toHex(JSON.stringify(payload)))
}

/**
 * Pure, deterministic bounded planner (PRD §7). Returns exactly one proposal.
 * Abstains whenever an input is missing, stale or outside policy.
 */
export function plan(m: LiquidityMandate, s: PlanningSnapshot): Proposal {
  const band = mandateBand(m)
  const d = m.base.decimals
  const fmtBase = (v: bigint) => `${formatAmount(v, d)} ${m.base.symbol}`
  const fmtQuote = (v: bigint) => `${formatAmount(v, m.quote.decimals)} ${m.quote.symbol}`
  const price = (tick: number) => tickToPrice(tick).toFixed(4)

  const ownBids = s.ownOrders.filter((o) => o.status === 'resting' && o.isBid && inBand(o.tick, band))
  const ownAsks = s.ownOrders.filter((o) => o.status === 'resting' && !o.isBid && inBand(o.tick, band))
  const coverage = {
    bid: coverageFor(BigInt(m.targetBidDepth), ownBids.reduce((a, o) => a + o.remaining, 0n)),
    ask: coverageFor(BigInt(m.targetAskDepth), ownAsks.reduce((a, o) => a + o.remaining, 0n)),
  }
  const inventory = computeInventory(m, s)
  const base = {
    coverage,
    inventory,
    marketObservationBlock: s.blockNumber,
    inputsDigest: digestInputs(m, s),
    expiresAtMs: s.observedAtMs + m.maxDataAgeSeconds * 1000,
  }
  const hold = (reasonCode: ReasonCode, cause: string, interpretation: string, nextCondition: string | null, kind: ProposalKind = 'NO_ACTION'): Proposal => ({
    ...base,
    kind,
    reasonCode,
    cause,
    interpretation,
    action: kind === 'PAUSE' ? 'Pause this market. No order will be placed.' : 'Wait. No order will be placed.',
    nextCondition,
    requiresApproval: kind === 'PAUSE',
  })

  if (m.status === 'closed') return hold('mandate_closed', 'This market is closed.', 'Closed markets never place orders.', null)
  if (m.status === 'paused') {
    return hold('mandate_paused', 'You paused this market.', 'Pausing blocks new orders. Existing resting orders stay on the book until you cancel them.', 'Resume the market to allow new orders.')
  }
  if (s.chainId !== s.expectedChainId || s.chainId !== m.chainId) {
    return hold('wrong_chain', `Your wallet is on chain ${s.chainId}, but this market is on chain ${m.chainId}.`, 'Korrin blocks signing on the wrong network.', `Switch to chain ${m.chainId}.`)
  }
  if (!s.marketSupported) {
    return hold('unsupported_market', `No ${m.base.symbol}/${m.quote.symbol} book was found on the Stablecoin DEX.`, 'Korrin only quotes on books it can read back.', 'The pair exists on the DEX.')
  }
  if (s.basePaused || s.quotePaused) {
    const which = s.basePaused ? m.base.symbol : m.quote.symbol
    return hold('token_paused', `${which} is paused by its issuer.`, 'Orders in a paused token can’t settle.', `The issuer unpauses ${which}.`)
  }
  const ageSeconds = Math.max(0, Math.floor((s.nowMs - s.observedAtMs) / 1000))
  if (ageSeconds > m.maxDataAgeSeconds) {
    return hold('stale_market', `The last market read is ${ageSeconds}s old. Your limit is ${m.maxDataAgeSeconds}s.`, 'Korrin never places orders from stale data.', 'A fresh read within your limit.')
  }
  if (!s.balances || !inventory) {
    return hold('balances_unreadable', 'Your wallet and DEX balances couldn’t be read.', 'Korrin can’t protect your reserve without them.', 'A successful balance read.')
  }
  const unknown = s.ownOrders.find((o) => o.status === 'unknown')
  if (unknown) {
    return hold('unreconciled_order', `Order ${unknown.orderId} couldn’t be confirmed on the DEX.`, 'Korrin won’t act while it’s unsure what it has on the book.', 'Every tracked order reads back.')
  }

  const midTick = hasBestBid(s.bestBidTick) && hasBestAsk(s.bestAskTick) ? (s.bestBidTick + s.bestAskTick) / 2 : null
  if (midTick !== null && !inBand(midTick, band)) {
    const distanceBps = Math.abs(midTick - m.targetTick) / 10
    const far = Math.abs(midTick - m.targetTick) > m.bandTicks * 2
    return hold(
      far ? 'market_far_outside_band' : 'market_outside_band',
      `The market mid is ${price(Math.round(midTick))}, ${distanceBps.toFixed(1)} bp from your ${price(m.targetTick)} target. Your range is ±${m.bandTicks / 10} bp.`,
      'Quoting now would buy or sell at a price you didn’t approve.',
      `The mid returns to between ${price(band.lowTick)} and ${price(band.highTick)}, or you change the target.`,
      far ? 'PAUSE' : 'NO_ACTION',
    )
  }

  const stray = s.ownOrders.find((o) => o.status === 'resting' && !inBand(o.tick, band))
  if (stray) {
    return {
      ...base,
      kind: 'CANCEL',
      reasonCode: 'order_outside_band',
      cause: `Order ${stray.orderId} rests at ${price(stray.tick)}, outside your range of ${price(band.lowTick)} to ${price(band.highTick)}.`,
      interpretation: 'It no longer counts toward your target and ties up capital outside your limits.',
      action: `Cancel order ${stray.orderId}. Its funds return to your DEX balance, not the wallet.`,
      nextCondition: null,
      requiresApproval: true,
      cancelOrderId: stray.orderId,
    }
  }

  const hourAgo = s.nowMs - 3_600_000
  const recent = s.recentActionTimestampsMs.filter((t) => t >= hourAgo).length
  if (recent >= m.maxActionsPerHour) {
    return hold('action_rate_limit', `${recent} orders in the last hour. Your limit is ${m.maxActionsPerHour}.`, 'Your plan caps how often Korrin touches the book.', 'An hour passes since the oldest one.')
  }

  if (coverage.bid.shortfall === 0n && coverage.ask.shortfall === 0n) {
    return {
      ...base,
      kind: 'KEEP',
      reasonCode: 'target_met',
      cause: `${fmtBase(coverage.bid.own)} on the bid and ${fmtBase(coverage.ask.own)} on the ask, both inside your range.`,
      interpretation: 'Both sides meet your target. Replacing orders now would only add churn.',
      action: 'Keep the current orders.',
      nextCondition: 'A fill, flip or cancel drops depth below target.',
      requiresApproval: false,
    }
  }

  const committedBid = inventory.quote.committed
  const committedAsk = inventory.base.committed
  const totalCommitted = committedBid + committedAsk
  const sideOrder: Side[] = coverage.bid.shortfall >= coverage.ask.shortfall ? ['buy', 'sell'] : ['sell', 'buy']
  const reasons: { code: ReasonCode; cause: string; next: string }[] = []

  for (const side of sideOrder) {
    const cov = side === 'buy' ? coverage.bid : coverage.ask
    if (cov.shortfall === 0n) continue
    const tick = side === 'buy' ? band.bidTick : band.askTick
    const flipTick = side === 'buy' ? band.askTick : band.bidTick
    const sideLabel = side === 'buy' ? 'bid' : 'ask'

    if (!isValidPlacementTick(tick) || !isValidPlacementTick(flipTick) || tick === flipTick) {
      reasons.push({ code: 'invalid_tick', cause: `Tick ${tick} is not a valid placement tick.`, next: 'Use a quote distance that’s a whole number of basis points.' })
      continue
    }
    if (side === 'buy' && hasBestAsk(s.bestAskTick) && tick >= s.bestAskTick) {
      reasons.push({ code: 'would_cross', cause: `A bid at ${price(tick)} would cross the best ask at ${price(s.bestAskTick)}.`, next: 'The best ask moves above your bid price.' })
      continue
    }
    if (side === 'sell' && hasBestBid(s.bestBidTick) && tick <= s.bestBidTick) {
      reasons.push({ code: 'would_cross', cause: `An ask at ${price(tick)} would cross the best bid at ${price(s.bestBidTick)}.`, next: 'The best bid moves below your ask price.' })
      continue
    }

    const sideCommitted = side === 'buy' ? committedBid : committedAsk
    if (totalCommitted > 0n && m.maxInventoryShareBps < 10_000) {
      const share = Number((sideCommitted * 10_000n) / totalCommitted)
      if (share >= m.maxInventoryShareBps && sideCommitted > 0n) {
        reasons.push({ code: 'inventory_skew', cause: `${share / 100}% of your committed funds already sit on the ${sideLabel} side. Your limit is ${m.maxInventoryShareBps / 100}%.`, next: 'The other side gets liquidity first.' })
        continue
      }
    }

    const bucket = side === 'buy' ? inventory.quote : inventory.base
    const spendable = minBigint(bucket.free, bucket.allocationRemaining)
    const spendableBase = side === 'buy' ? (spendable * 100_000n) / BigInt(100_000 + tick) : spendable
    let amount = minBigint(cov.shortfall, BigInt(m.maxOrderAmount), spendableBase)
    const roundedUpToMinimum = amount < s.minOrderAmount
    if (roundedUpToMinimum) amount = s.minOrderAmount
    if (amount > BigInt(m.maxOrderAmount)) {
      reasons.push({ code: 'below_minimum', cause: `The DEX minimum is ${fmtBase(s.minOrderAmount)}, but your order cap is ${fmtBase(BigInt(m.maxOrderAmount))}.`, next: 'You raise the order cap to at least the DEX minimum.' })
      continue
    }
    if (amount > spendableBase) {
      const need = side === 'buy' ? fmtQuote(quoteForBase(amount, tick)) : fmtBase(amount)
      const have = side === 'buy' ? fmtQuote(spendable) : fmtBase(spendable)
      reasons.push({ code: 'insufficient_free_inventory', cause: `A ${sideLabel} needs ${need}. You have ${have} free after your reserve and allocation.`, next: `You add funds, or lower the ${side === 'buy' ? m.quote.symbol : m.base.symbol} reserve.` })
      continue
    }

    const escrowAmount = side === 'buy' ? quoteForBase(amount, tick) : amount
    const kind: ProposalKind = side === 'buy' ? 'PLACE_BID' : 'PLACE_ASK'
    const ratioPct = (cov.ratio * 100).toFixed(0)
    return {
      ...base,
      kind,
      reasonCode: 'depth_shortfall',
      cause: `${fmtBase(cov.own)} of your ${fmtBase(cov.target)} ${sideLabel} target is on the book (${ratioPct}%).`,
      interpretation: `The ${sideLabel} side is ${fmtBase(cov.shortfall)} short inside your range.`,
      action: `Place one flip ${sideLabel} for ${fmtBase(amount)} at ${price(tick)}. When it fills, it flips to ${price(flipTick)}.${roundedUpToMinimum ? ' Rounded up to the DEX minimum order.' : ''}`,
      nextCondition: null,
      requiresApproval: true,
      candidateOrder: { side, amount, tick, flipTick, escrowToken: side === 'buy' ? 'quote' : 'base', escrowAmount },
    }
  }

  const first = reasons[0] ?? { code: 'depth_shortfall' as const, cause: 'No order fits your limits.', next: 'The book or your limits change.' }
  return hold(first.code, first.cause, 'No order within your limits can close the gap right now.', first.next)
}

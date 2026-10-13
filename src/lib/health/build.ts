import { type Hex, keccak256, toHex } from 'viem'
import { canonicalize } from '../mandate/digest'
import { bookShape, spreadBps } from '../market/book'
import { hasBestAsk, hasBestBid, quoteForBase, tickToPrice } from '../market/ticks'
import { coverageFor, inBand } from '../policy/plan'
import {
  type CoverageMetric,
  HEALTH_METHODOLOGY_VERSION,
  HEALTH_SCHEMA_VERSION,
  type HealthInput,
  type HealthLevel,
  type InventoryBucket,
  type LiquidityHealthReport,
  type Metric,
  type Provenance,
  type Quality,
} from './types'

const DISCLOSURES = [
  'Testnet data. Tempo Moderato tokens have no real-world value.',
  'Depth is resting order quantity in base-token units at the observed block. It can be filled or cancelled at any time and is not a guarantee of future liquidity.',
  'Not a peg guarantee, redemption promise, investment product or yield offering.',
  'Unknown values are reported as null with a reason. They are never converted to zero.',
]

type SideDepth = { total: bigint | null; lowerBound: bigint; read: number; unreadable: number; expected: number }

/** Ticks a reader should have read on one side inside the band, given the best price. */
function expectedTicks(isBid: boolean, best: number, low: number, high: number, spacing: number): number[] {
  const ticks: number[] = []
  if (isBid ? !hasBestBid(best) : !hasBestAsk(best)) return ticks
  const start = Math.ceil(low / spacing) * spacing
  for (let t = start; t <= high; t += spacing) if (isBid ? t <= best : t >= best) ticks.push(t)
  return ticks
}

function sideDepth(levels: HealthLevel[], isBid: boolean, best: number, low: number, high: number, spacing: number): SideDepth {
  const expected = expectedTicks(isBid, best, low, high, spacing)
  let sum = 0n
  let read = 0
  let unreadable = 0
  for (const tick of expected) {
    const level = levels.find((l) => l.tick === tick && l.isBid === isBid)
    if (level?.status === 'ok' && level.liquidity !== null) {
      sum += BigInt(level.liquidity)
      read++
    } else unreadable++
  }
  return { total: unreadable === 0 ? sum : null, lowerBound: sum, read, unreadable, expected: expected.length }
}

const fmtPrice = (tick: number) => tickToPrice(tick).toFixed(5)

function metric(value: bigint | string | null, source: Provenance, asOfBlock: string | undefined, unit: string, reasonIfNull?: string, lowerBound?: bigint): Metric {
  if (value === null) return { value: null, unit, source, asOfBlock, reasonIfNull, ...(lowerBound !== undefined && lowerBound > 0n ? { lowerBound: lowerBound.toString() } : {}) }
  return { value: value.toString(), unit, source, asOfBlock }
}

function coverageMetric(target: bigint, own: bigint | null, source: Provenance, block: string | undefined): CoverageMetric {
  if (target === 0n) return { value: null, unit: 'ratio', source, asOfBlock: block, status: 'NOT_APPLICABLE', ratio: null, reasonIfNull: 'The plan sets no target on this side.' }
  if (own === null) return { value: null, unit: 'ratio', source, asOfBlock: block, status: 'UNKNOWN', ratio: null, reasonIfNull: 'Own resting depth is unknown because an order could not be confirmed.' }
  const c = coverageFor(target, own)
  return { value: c.ratio.toFixed(4), unit: 'ratio', source, asOfBlock: block, status: c.shortfall === 0n ? 'MET' : 'SHORT', ratio: c.ratio }
}

function bucket(wallet: bigint, dex: bigint, reserve: bigint, committed: bigint, unreconciled: bigint, inflight: number): InventoryBucket {
  const reservedFromWallet = reserve < wallet ? reserve : wallet
  const reservedFromDex = reserve - reservedFromWallet < dex ? reserve - reservedFromWallet : dex
  return {
    idleWallet: (wallet - reservedFromWallet).toString(),
    dexInternalFree: (dex - reservedFromDex).toString(),
    committedResting: committed.toString(),
    reservedPolicy: (reservedFromWallet + reservedFromDex).toString(),
    unreconciled: unreconciled.toString(),
    inflightActions: inflight,
  }
}

/** keccak256 over the canonical JSON of the report body, excluding its own identity. */
export function reportDigest(body: Omit<LiquidityHealthReport, 'reportId' | 'evidence'> & { evidence: Omit<LiquidityHealthReport['evidence'], 'snapshotDigest'> }): Hex {
  return keccak256(toHex(JSON.stringify(canonicalize(body))))
}

export const reportIdFor = (digest: Hex) => `lhr_${digest.slice(2, 26)}`

/**
 * Builds one immutable report from a reconciled observation. Pure and deterministic:
 * the same input always yields the same fields, digest and report ID. Freshness is
 * deliberately not part of the body, because it changes with the reader's clock; use
 * {@link assessFreshness} at read time.
 */
export function buildHealthReport(input: HealthInput): LiquidityHealthReport {
  const obs = input.observation
  const src = input.source
  const block = obs?.blockNumber
  const unit = input.market.base.symbol
  const low = input.band.centerTick - input.band.halfWidthTicks
  const high = input.band.centerTick + input.band.halfWidthTicks
  const band = { lowTick: low, highTick: high }
  const noObs = input.observationError ?? 'No market observation was available.'

  const bidDepth = obs ? sideDepth(obs.levels, true, obs.bestBidTick, low, high, obs.tickSpacing) : null
  const askDepth = obs ? sideDepth(obs.levels, false, obs.bestAskTick, low, high, obs.tickSpacing) : null
  const unreadableInBand = (bidDepth?.unreadable ?? 0) + (askDepth?.unreadable ?? 0)
  const partial = unreadableInBand > 0
  const totalReason = (d: SideDepth | null) => (d === null ? noObs : `${d.unreadable} of ${d.expected} price levels in the band could not be read from the RPC.`)

  const orders = input.ownOrders ?? []
  const unknownOrders = orders.filter((o) => o.status === 'unknown')
  const pendingOrders = orders.filter((o) => o.status === 'pending')
  const liveOrders = orders.filter((o) => o.status === 'live')
  const ownSide = (isBid: boolean) => liveOrders.filter((o) => o.isBid === isBid && inBand(o.tick, band)).reduce((a, o) => a + BigInt(o.remaining), 0n)
  const ownKnown = unknownOrders.length === 0
  const scoped = Boolean(input.mandate)
  const ownBid = scoped && ownKnown ? ownSide(true) : null
  const ownAsk = scoped && ownKnown ? ownSide(false) : null
  const ownReason = !scoped ? 'No mandate is in scope, so no orders are attributed to an owner.' : `${unknownOrders.length} tracked order(s) could not be confirmed by readback.`
  const external = (total: bigint | null, own: bigint | null) => (total === null ? null : !scoped ? total : own === null ? null : total - own)
  const externalReason = (total: bigint | null, d: SideDepth | null) => (total === null ? totalReason(d) : ownReason)

  const shape = obs ? bookShape(obs.bestBidTick, obs.bestAskTick) : 'unknown'
  const spread = obs ? spreadBps(obs.bestBidTick, obs.bestAskTick) : null

  let inventory: LiquidityHealthReport['inventory'] = null
  if (input.mandate && input.balances) {
    const committed = { base: 0n, quote: 0n }
    const unreconciled = { base: 0n, quote: 0n }
    for (const o of liveOrders) {
      if (o.isBid) committed.quote += quoteForBase(BigInt(o.remaining), o.tick)
      else committed.base += BigInt(o.remaining)
    }
    for (const o of unknownOrders) {
      if (o.isBid) unreconciled.quote += quoteForBase(BigInt(o.remaining), o.tick)
      else unreconciled.base += BigInt(o.remaining)
    }
    const b = input.balances
    inventory = {
      readAtBlock: b.readAtBlock,
      base: bucket(BigInt(b.base.wallet), BigInt(b.base.dex), BigInt(input.mandate.reserveBase), committed.base, unreconciled.base, input.inflightActions ?? 0),
      quote: bucket(BigInt(b.quote.wallet), BigInt(b.quote.dex), BigInt(input.mandate.reserveQuote), committed.quote, unreconciled.quote, input.inflightActions ?? 0),
    }
  }

  const qualityReasons: string[] = []
  if (!obs) qualityReasons.push(`No observation: ${noObs}`)
  else {
    if (partial) qualityReasons.push(`${unreadableInBand} price level(s) in the band could not be read, so total depth is unknown.`)
    if (unknownOrders.length) qualityReasons.push(`${unknownOrders.length} order(s) could not be confirmed by readback.`)
    if (input.mandate && !input.balances) qualityReasons.push('Wallet and DEX balances could not be read.')
    if (shape === 'crossed') qualityReasons.push('The best bid is above the best ask.')
  }
  const quality: Quality = !obs ? 'UNAVAILABLE' : qualityReasons.length ? 'DEGRADED' : 'HIGH'

  const reasonCodes = [
    ...(!obs ? ['RPC_UNAVAILABLE'] : []),
    ...(partial ? ['LEVELS_UNREADABLE'] : []),
    ...(unknownOrders.length ? ['ORDER_STATE_DIVERGENCE'] : []),
    ...(shape === 'crossed' ? ['BOOK_CROSSED'] : []),
  ]

  const targetBid = BigInt(input.mandate?.targetBidDepth ?? '0')
  const targetAsk = BigInt(input.mandate?.targetAskDepth ?? '0')
  const shortfall = (target: bigint, own: bigint | null) => (own === null ? null : own >= target ? 0n : target - own)

  const body = {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    network: { chainId: input.network.chainId, name: input.network.name, environment: input.network.environment },
    market: {
      marketId: input.market.marketId,
      base: input.market.base.symbol,
      quote: input.market.quote.symbol,
      baseAddress: input.market.base.address,
      quoteAddress: input.market.quote.address,
      decimals: input.market.base.decimals,
      ...(input.market.bookKey ? { bookKey: input.market.bookKey } : {}),
    },
    window: {
      observedAt: obs ? new Date(obs.observedAtMs).toISOString() : null,
      block: block ?? null,
      maxAllowedAgeSeconds: input.maxAgeSeconds,
      source: src,
      rpcHost: input.network.rpcHost,
    },
    methodology: {
      version: HEALTH_METHODOLOGY_VERSION,
      policyVersion: input.mandate?.version ?? null,
      band: { centerTick: input.band.centerTick, halfWidthBps: input.band.halfWidthTicks / 10, lowTick: low, highTick: high, basis: input.band.basis },
      externalDataFeeds: [],
    },
    quote: {
      bestBid: obs && hasBestBid(obs.bestBidTick) ? metric(fmtPrice(obs.bestBidTick), src, block, input.market.quote.symbol) : metric(null, src, block, input.market.quote.symbol, obs ? 'The book has no bids.' : noObs),
      bestAsk: obs && hasBestAsk(obs.bestAskTick) ? metric(fmtPrice(obs.bestAskTick), src, block, input.market.quote.symbol) : metric(null, src, block, input.market.quote.symbol, obs ? 'The book has no asks.' : noObs),
      spreadBps: spread === null ? metric(null, src, block, 'bp', obs ? 'Spread needs both a best bid and a best ask.' : noObs) : metric(spread.toFixed(2), src, block, 'bp'),
      shape,
    },
    depth: {
      levelsInBand: (bidDepth?.expected ?? 0) + (askDepth?.expected ?? 0),
      unreadableLevelsInBand: unreadableInBand,
      totalBid: metric(bidDepth?.total ?? null, src, block, unit, totalReason(bidDepth), bidDepth?.lowerBound),
      totalAsk: metric(askDepth?.total ?? null, src, block, unit, totalReason(askDepth), askDepth?.lowerBound),
      ownBid: metric(obs ? ownBid : null, src, block, unit, obs ? ownReason : noObs),
      ownAsk: metric(obs ? ownAsk : null, src, block, unit, obs ? ownReason : noObs),
      externalBid: metric(external(bidDepth?.total ?? null, ownBid), src, block, unit, externalReason(bidDepth?.total ?? null, bidDepth)),
      externalAsk: metric(external(askDepth?.total ?? null, ownAsk), src, block, unit, externalReason(askDepth?.total ?? null, askDepth)),
    },
    mandate: input.mandate
      ? {
          id: input.mandate.id,
          name: input.mandate.name,
          status: input.mandate.status,
          version: input.mandate.version,
          policyDigest: input.mandate.policyDigest,
          targetBid: targetBid.toString(),
          targetAsk: targetAsk.toString(),
          coverageBid: coverageMetric(targetBid, obs ? ownBid : null, src, block),
          coverageAsk: coverageMetric(targetAsk, obs ? ownAsk : null, src, block),
          shortfallBid: metric(obs ? shortfall(targetBid, ownBid) : null, src, block, unit, obs ? ownReason : noObs),
          shortfallAsk: metric(obs ? shortfall(targetAsk, ownAsk) : null, src, block, unit, obs ? ownReason : noObs),
          decision: input.decision ?? null,
        }
      : null,
    inventory,
    orders: { live: liveOrders.length, pending: pendingOrders.length, unknown: unknownOrders.length, ids: orders.map((o) => o.orderId).sort() },
    risk: { unreconciled: unknownOrders.length > 0, partialDepth: partial, crossed: shape === 'crossed', reasonCodes },
    quality,
    qualityReasons,
    disclosures: src === 'RECORDED_REPLAY' ? [...DISCLOSURES, 'Recorded session replay. Not a live observation.'] : DISCLOSURES,
  } satisfies Omit<LiquidityHealthReport, 'reportId' | 'evidence'>

  const evidenceBase = {
    blockExplorerUrls: [...(block ? [`${input.network.explorer}/block/${block}`] : []), ...orders.filter((o) => o.placedTx).map((o) => `${input.network.explorer}/tx/${o.placedTx}`)],
    nativeOrderIds: orders.map((o) => o.orderId).sort(),
  }
  const snapshotDigest = reportDigest({ ...body, evidence: evidenceBase })
  return { ...body, reportId: reportIdFor(snapshotDigest), evidence: { ...evidenceBase, snapshotDigest } }
}

/** Recomputes the digest of a received report. A mismatch means it was altered after publication. */
export function verifyReportDigest(report: LiquidityHealthReport): boolean {
  const { reportId, evidence, ...body } = report
  const { snapshotDigest, ...evidenceBase } = evidence
  const digest = reportDigest({ ...body, evidence: evidenceBase })
  return digest === snapshotDigest && reportIdFor(digest) === reportId
}

export type Freshness = { ageSeconds: number | null; stale: boolean; maxAllowedAgeSeconds: number }

/** How old the report's observation is for a reader at `nowMs`. Never stored in the report. */
export function assessFreshness(report: Pick<LiquidityHealthReport, 'window'>, nowMs: number): Freshness {
  const observed = report.window.observedAt ? Date.parse(report.window.observedAt) : null
  const ageSeconds = observed === null ? null : Math.max(0, Math.floor((nowMs - observed) / 1000))
  return { ageSeconds, stale: ageSeconds === null || ageSeconds > report.window.maxAllowedAgeSeconds, maxAllowedAgeSeconds: report.window.maxAllowedAgeSeconds }
}

import type { LiquidityHealthReport, Metric } from './types'

export type ReportChange = {
  path: string
  label: string
  before: string | null
  after: string | null
  /** after − before, for base-unit amounts known on both sides. */
  delta?: string
  kind: 'amount' | 'price' | 'status' | 'count'
}

const AMOUNT_PATHS: [string, string, (r: LiquidityHealthReport) => Metric | undefined][] = [
  ['depth.ownBid', 'Your bids in the band', (r) => r.depth.ownBid],
  ['depth.ownAsk', 'Your asks in the band', (r) => r.depth.ownAsk],
  ['depth.externalBid', 'Other bids in the band', (r) => r.depth.externalBid],
  ['depth.externalAsk', 'Other asks in the band', (r) => r.depth.externalAsk],
  ['depth.totalBid', 'All bids in the band', (r) => r.depth.totalBid],
  ['depth.totalAsk', 'All asks in the band', (r) => r.depth.totalAsk],
  ['mandate.shortfallBid', 'Bid gap to target', (r) => r.mandate?.shortfallBid],
  ['mandate.shortfallAsk', 'Ask gap to target', (r) => r.mandate?.shortfallAsk],
]

/**
 * Field-by-field difference between two reports for the same market (PRD v2 §7,
 * "explain a change"). Only fields that differ are returned, in a fixed order.
 */
export function compareReports(before: LiquidityHealthReport, after: LiquidityHealthReport): { compatible: boolean; reason?: string; changes: ReportChange[] } {
  if (before.market.marketId !== after.market.marketId) return { compatible: false, reason: 'The reports are for different markets.', changes: [] }
  if (before.methodology.band.lowTick !== after.methodology.band.lowTick || before.methodology.band.highTick !== after.methodology.band.highTick) {
    return { compatible: false, reason: 'The reports measure different price bands, so their depth is not comparable.', changes: [] }
  }
  const changes: ReportChange[] = []
  const push = (c: ReportChange) => {
    if (c.before !== c.after) changes.push(c)
  }
  push({ path: 'quality', label: 'Report quality', before: before.quality, after: after.quality, kind: 'status' })
  push({ path: 'quote.bestBid', label: 'Best bid', before: before.quote.bestBid.value, after: after.quote.bestBid.value, kind: 'price' })
  push({ path: 'quote.bestAsk', label: 'Best ask', before: before.quote.bestAsk.value, after: after.quote.bestAsk.value, kind: 'price' })
  push({ path: 'quote.spreadBps', label: 'Spread (bp)', before: before.quote.spreadBps.value, after: after.quote.spreadBps.value, kind: 'price' })
  for (const [path, label, get] of AMOUNT_PATHS) {
    const a = get(before)?.value ?? null
    const b = get(after)?.value ?? null
    push({ path, label, before: a, after: b, kind: 'amount', ...(a !== null && b !== null ? { delta: (BigInt(b) - BigInt(a)).toString() } : {}) })
  }
  push({ path: 'mandate.coverageBid.status', label: 'Bid target', before: before.mandate?.coverageBid.status ?? null, after: after.mandate?.coverageBid.status ?? null, kind: 'status' })
  push({ path: 'mandate.coverageAsk.status', label: 'Ask target', before: before.mandate?.coverageAsk.status ?? null, after: after.mandate?.coverageAsk.status ?? null, kind: 'status' })
  push({ path: 'orders.live', label: 'Your orders on the book', before: String(before.orders.live), after: String(after.orders.live), kind: 'count' })
  push({ path: 'mandate.decision.kind', label: 'Next step', before: before.mandate?.decision?.kind ?? null, after: after.mandate?.decision?.kind ?? null, kind: 'status' })
  return { compatible: true, changes }
}

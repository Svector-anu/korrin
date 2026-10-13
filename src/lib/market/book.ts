import { formatTickPrice, hasBestAsk, hasBestBid } from './ticks'

export type BookShape = 'two-sided' | 'locked' | 'crossed' | 'bids only' | 'asks only' | 'empty'

export function bookShape(bestBidTick: number, bestAskTick: number): BookShape {
  const b = hasBestBid(bestBidTick)
  const a = hasBestAsk(bestAskTick)
  if (b && a) return bestBidTick > bestAskTick ? 'crossed' : bestBidTick === bestAskTick ? 'locked' : 'two-sided'
  if (b) return 'bids only'
  if (a) return 'asks only'
  return 'empty'
}

/** Spread in basis points between best ask and best bid, or null if either side is empty. */
export function spreadBps(bestBidTick: number, bestAskTick: number): number | null {
  if (!hasBestBid(bestBidTick) || !hasBestAsk(bestAskTick)) return null
  return (bestAskTick - bestBidTick) / 10
}

export function midTick(bestBidTick: number, bestAskTick: number): number | null {
  if (!hasBestBid(bestBidTick) || !hasBestAsk(bestAskTick)) return null
  return (bestBidTick + bestAskTick) / 2
}

export function bestPrice(tick: number, side: 'bid' | 'ask'): string {
  return (side === 'bid' ? hasBestBid(tick) : hasBestAsk(tick)) ? formatTickPrice(tick) : '—'
}

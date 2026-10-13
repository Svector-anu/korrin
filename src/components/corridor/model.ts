import { hasBestAsk, hasBestBid } from '@/lib/market/ticks'

export type CorridorOrder = {
  orderId: string
  isBid: boolean
  tick: number
  flipTick: number
  remaining: bigint
  /** pending: submitted, not yet confirmed by readback. Never drawn as resting liquidity. */
  state: 'resting' | 'pending' | 'unknown'
}

export type CorridorLevel = {
  tick: number
  isBid: boolean
  status: 'ok' | 'unreadable' | 'not_read'
  total: bigint | null
  own: bigint
  external: bigint | null
}

export type CorridorProposal = { side: 'buy' | 'sell'; tick: number; flipTick: number; amount: bigint }

export type CorridorModel = {
  from: number
  to: number
  targetTick: number
  /** 0 hides the corridor band (plain market view). */
  bandTicks: number
  targetLabel?: string
  bestBidTick: number | null
  bestAskTick: number | null
  levels: CorridorLevel[]
  orders: CorridorOrder[]
  proposal: CorridorProposal | null
  coverage: { bid: { own: bigint; target: bigint }; ask: { own: bigint; target: bigint } } | null
  decimals: number
  baseSymbol: string
  quoteSymbol: string
}

type RawLevel = { tick: number; isBid: boolean; status: 'ok' | 'unreadable'; liquidity: string | null }

/**
 * Merges DEX level readings with the operator's own confirmed orders. External
 * depth is the level total minus Korrin's own resting amount at that level.
 */
export function buildLevels(raw: RawLevel[], orders: CorridorOrder[], from: number, to: number, bestBid: number, bestAsk: number): CorridorLevel[] {
  const byKey = new Map(raw.map((l) => [`${l.tick}:${l.isBid}`, l]))
  const own = new Map<string, bigint>()
  for (const o of orders) {
    if (o.state !== 'resting') continue
    const key = `${o.tick}:${o.isBid}`
    own.set(key, (own.get(key) ?? 0n) + o.remaining)
  }
  const out: CorridorLevel[] = []
  for (let tick = Math.ceil(from / 10) * 10; tick <= to; tick += 10) {
    for (const isBid of [true, false]) {
      const onSide = isBid ? hasBestBid(bestBid) && tick <= bestBid : hasBestAsk(bestAsk) && tick >= bestAsk
      const key = `${tick}:${isBid}`
      const ownAmount = own.get(key) ?? 0n
      if (!onSide && ownAmount === 0n) continue
      const r = byKey.get(key)
      if (!r) {
        out.push({ tick, isBid, status: 'not_read', total: null, own: ownAmount, external: null })
        continue
      }
      if (r.status === 'unreadable' || r.liquidity === null) {
        out.push({ tick, isBid, status: 'unreadable', total: null, own: ownAmount, external: null })
        continue
      }
      const total = BigInt(r.liquidity)
      const external = total > ownAmount ? total - ownAmount : 0n
      if (total === 0n && ownAmount === 0n) continue
      out.push({ tick, isBid, status: 'ok', total, own: ownAmount, external })
    }
  }
  return out
}

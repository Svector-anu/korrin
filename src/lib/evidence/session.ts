import type { Address, Hex } from 'viem'
import { buildLevels, type CorridorModel, type CorridorOrder } from '@/components/corridor/model'
import type { LiquidityMandate } from '../mandate/types'
import { hasBestAsk, hasBestBid } from '../market/ticks'
import type { ProposalKind } from '../policy/plan'
import raw from './session.generated.json'

export type SessionFrame = {
  index: number
  atMs: number
  kind: 'observe' | 'propose' | 'submit' | 'confirm' | 'fill' | 'flip' | 'pause' | 'cancel' | 'withdraw'
  title: string
  narration: string
  actor: 'korrin' | 'operator' | 'test-taker'
  tx?: { hash: Hex; block: string; events: { event: string; logIndex: number; args: Record<string, unknown> }[] }
  book: { blockNumber: string; observedAt: number; bestBidTick: number; bestAskTick: number; levels: { tick: number; isBid: boolean; status: 'ok' | 'unreadable'; liquidity: string | null }[] }
  orders: { orderId: string; status: string; isBid?: boolean; tick?: number; flipTick?: number; remaining?: string }[]
  balances: { token: Address; wallet: string; dex: string }[]
  decision: { kind: ProposalKind; reasonCode: string; cause: string; interpretation: string; action: string; nextCondition: string | null; candidate?: { side: 'buy' | 'sell'; tick: number; flipTick: number; amount: string } }
  mandateStatus: 'armed' | 'active' | 'paused'
}

export type CapturedSession = {
  capturedAt: string
  network: { chainId: number; name: string; rpc: string; explorer: string }
  maker: Address
  taker: Address
  disclosure: string
  mandate: LiquidityMandate
  window: { from: number; to: number }
  frames: SessionFrame[]
}

export const SESSION = raw as unknown as CapturedSession

export function frameCorridor(session: CapturedSession, frame: SessionFrame): CorridorModel {
  const m = session.mandate
  const orders: CorridorOrder[] = frame.orders.flatMap((o) =>
    o.status === 'live' && o.tick !== undefined && o.flipTick !== undefined && o.isBid !== undefined && o.remaining
      ? [{ orderId: o.orderId, isBid: o.isBid, tick: o.tick, flipTick: o.flipTick, remaining: BigInt(o.remaining), state: 'resting' as const }]
      : [],
  )
  const inBand = (t: number) => t >= m.targetTick - m.bandTicks && t <= m.targetTick + m.bandTicks
  const own = (bid: boolean) => orders.filter((o) => o.isBid === bid && inBand(o.tick)).reduce((a, o) => a + o.remaining, 0n)
  const c = frame.mandateStatus !== 'paused' ? frame.decision.candidate : undefined
  return {
    from: session.window.from,
    to: session.window.to,
    targetTick: m.targetTick,
    bandTicks: m.bandTicks,
    bestBidTick: hasBestBid(frame.book.bestBidTick) ? frame.book.bestBidTick : null,
    bestAskTick: hasBestAsk(frame.book.bestAskTick) ? frame.book.bestAskTick : null,
    levels: buildLevels(frame.book.levels, orders, session.window.from, session.window.to, frame.book.bestBidTick, frame.book.bestAskTick),
    orders,
    proposal: c ? { side: c.side, tick: c.tick, flipTick: c.flipTick, amount: BigInt(c.amount) } : null,
    coverage: { bid: { own: own(true), target: BigInt(m.targetBidDepth) }, ask: { own: own(false), target: BigInt(m.targetAskDepth) } },
    decimals: m.base.decimals,
    baseSymbol: m.base.symbol,
    quoteSymbol: m.quote.symbol,
  }
}

import type { CapturedSession, SessionFrame } from '../evidence/session'
import { buildHealthReport } from './build'
import { mandateHealthInput, type NetworkInfo } from './input'
import type { LiquidityHealthReport } from './types'

/**
 * Health report for one frame of a recorded session. Every input is what was read
 * from chain at capture time, and the report is labelled RECORDED_REPLAY.
 */
export function frameHealthReport(session: CapturedSession, frame: SessionFrame, network: NetworkInfo): LiquidityHealthReport {
  const m = { ...session.mandate, status: frame.mandateStatus }
  const bal = (addr: string) => frame.balances.find((b) => b.token.toLowerCase() === addr.toLowerCase())
  const b = bal(m.base.address)
  const q = bal(m.quote.address)
  const decision = { kind: frame.decision.kind, reasonCode: frame.decision.reasonCode, cause: frame.decision.cause, action: frame.decision.action, nextCondition: frame.decision.nextCondition }
  return buildHealthReport(
    mandateHealthInput({
      network,
      mandate: m,
      source: 'RECORDED_REPLAY',
      observation: { blockNumber: frame.book.blockNumber, observedAtMs: frame.book.observedAt, bestBidTick: frame.book.bestBidTick, bestAskTick: frame.book.bestAskTick, levels: frame.book.levels, tickSpacing: 10 },
      ownOrders: frame.orders.map((o) => ({
        orderId: o.orderId,
        status: o.status === 'live' ? 'live' : o.status === 'absent' ? 'absent' : 'unknown',
        isBid: o.isBid ?? true,
        tick: o.tick ?? 0,
        flipTick: o.flipTick ?? 0,
        remaining: o.remaining ?? '0',
      })),
      balances: b && q ? { readAtBlock: frame.book.blockNumber, base: { wallet: b.wallet, dex: b.dex }, quote: { wallet: q.wallet, dex: q.dex } } : null,
      inflightActions: 0,
      proposal: decision,
    }),
  )
}

import { formatAmount } from '../units'
import type { Freshness } from './build'
import type { LiquidityHealthReport } from './types'

export type ExceptionCode =
  | 'RPC_UNAVAILABLE'
  | 'MARKET_DATA_STALE'
  | 'LEVELS_UNREADABLE'
  | 'ORDER_STATE_DIVERGENCE'
  | 'PENDING_TRANSACTION'
  | 'FAILED_ACTION'
  | 'FLIP_FAILED'
  | 'BOOK_CROSSED'
  | 'PRICE_OUTSIDE_CORRIDOR'
  | 'DEPTH_SHORTFALL_BID'
  | 'DEPTH_SHORTFALL_ASK'
  | 'INVENTORY_RESERVE_LIMIT'
  | 'INVENTORY_IMBALANCE'
  | 'PAUSED_WITH_ORDERS'
  | 'DEX_BALANCE_IDLE'
  | 'COVERAGE_RESTORED'

export type Severity = 'high' | 'medium' | 'low'

export type MarketException = {
  code: ExceptionCode
  severity: Severity
  title: string
  /** What was observed and what it means, in the operator's terms. */
  explanation: string
  /** The specific way out. */
  recovery: string
  /** True when Korrin will not propose new orders while this holds. */
  blocksNewOrders: boolean
  /** Report fields this exception is derived from, as dotted paths. */
  evidencePaths: string[]
  orderIds?: string[]
}

/** Context that is not part of the immutable market report but is known to the operator's workspace. */
export type ExceptionContext = {
  freshness: Freshness
  pendingActions?: { summary: string; stage: string; orderId?: string }[]
  failedActions?: { summary: string; error?: string; orderId?: string }[]
  flipFailedOrderIds?: string[]
  previous?: LiquidityHealthReport | null
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

const DECISION_EXCEPTIONS: Record<string, { code: ExceptionCode; severity: Severity; title: string; recovery: string }> = {
  market_outside_band: { code: 'PRICE_OUTSIDE_CORRIDOR', severity: 'high', title: 'The market moved outside your range', recovery: 'Wait for the mid to come back, or change the target price in a new plan version.' },
  market_far_outside_band: { code: 'PRICE_OUTSIDE_CORRIDOR', severity: 'high', title: 'The market is far outside your range', recovery: 'Korrin proposes pausing. Review the target price before quoting again.' },
  insufficient_free_inventory: { code: 'INVENTORY_RESERVE_LIMIT', severity: 'high', title: 'Not enough free funds for the next order', recovery: 'Add funds, withdraw your DEX balance, or lower the reserve you keep in the wallet.' },
  inventory_skew: { code: 'INVENTORY_IMBALANCE', severity: 'medium', title: 'Too much of your funds sit on one side', recovery: 'Korrin fills the other side first. Raise the one-side limit only if that exposure is intended.' },
}

function shortfallRecovery(side: 'bid' | 'ask', decision: NonNullable<LiquidityHealthReport['mandate']>['decision']): string {
  if (!decision) return 'Review the next step on this market.'
  const mine = side === 'bid' ? 'PLACE_BID' : 'PLACE_ASK'
  const other = side === 'bid' ? 'PLACE_ASK' : 'PLACE_BID'
  if (decision.kind === mine) return `Review the proposed order: ${decision.action}`
  if (decision.kind === other) return `The ${side === 'bid' ? 'ask' : 'bid'} side has the larger gap, so Korrin proposes it first. The ${side} follows once that order is verified.`
  return `Korrin isn’t proposing an order right now. ${decision.cause}`
}

/**
 * Pure evaluator over one report plus workspace context (PRD v2 §6.1). The same
 * inputs always produce the same exceptions in the same order.
 */
export function evaluateExceptions(report: LiquidityHealthReport, ctx: ExceptionContext): MarketException[] {
  const out: MarketException[] = []
  const d = report.market.decimals
  const unit = report.market.base
  const amt = (v: string | null) => (v === null ? 'unknown' : `${formatAmount(BigInt(v), d)} ${unit}`)
  const m = report.mandate
  const scoped = m !== null
  const paused = m?.status === 'paused'

  if (report.quality === 'UNAVAILABLE') {
    out.push({
      code: 'RPC_UNAVAILABLE',
      severity: 'high',
      title: 'No fresh read of the market',
      explanation: report.qualityReasons[0] ?? 'Korrin could not read the order book.',
      recovery: 'Korrin retries automatically. Nothing is proposed until a read succeeds.',
      blocksNewOrders: true,
      evidencePaths: ['quality', 'qualityReasons'],
    })
    return out
  }

  if (ctx.freshness.stale) {
    out.push({
      code: 'MARKET_DATA_STALE',
      severity: 'high',
      title: 'Market data is older than your limit',
      explanation: `The last read is ${ctx.freshness.ageSeconds ?? '?'}s old and your limit is ${ctx.freshness.maxAllowedAgeSeconds}s. Korrin never acts on stale data.`,
      recovery: 'Wait for the next read, or refresh. If reads keep failing, the Tempo RPC may be degraded.',
      blocksNewOrders: true,
      evidencePaths: ['window.observedAt', 'window.maxAllowedAgeSeconds'],
    })
  }

  if (report.risk.unreconciled) {
    out.push({
      code: 'ORDER_STATE_DIVERGENCE',
      severity: 'high',
      title: `${report.orders.unknown} order(s) couldn’t be confirmed`,
      explanation: 'Reading these orders back from the DEX failed or disagreed with what was signed. Their liquidity is excluded from your coverage until a readback succeeds.',
      recovery: 'Korrin retries the readback. Open the order on the explorer if it stays unresolved.',
      blocksNewOrders: true,
      evidencePaths: ['orders.unknown', 'risk.unreconciled', 'depth.ownBid', 'depth.ownAsk'],
    })
  }

  if (report.risk.partialDepth) {
    out.push({
      code: 'LEVELS_UNREADABLE',
      severity: 'medium',
      title: 'Some price levels couldn’t be read',
      explanation: `${report.depth.unreadableLevelsInBand} of ${report.depth.levelsInBand} levels in the band failed to read, so total and external depth are unknown.${scoped ? ' Your own orders are still read directly.' : ''}`,
      recovery: 'No action needed. Crowded levels can exceed the RPC’s gas limit; Korrin shows them as unreadable instead of empty.',
      blocksNewOrders: false,
      evidencePaths: ['depth.unreadableLevelsInBand', 'depth.totalBid', 'depth.totalAsk'],
    })
  }

  if (report.risk.crossed) {
    out.push({
      code: 'BOOK_CROSSED',
      severity: 'medium',
      title: 'The book is crossed',
      explanation: `The best bid (${report.quote.bestBid.value}) is above the best ask (${report.quote.bestAsk.value}). Tempo rests orders without matching them, so this can persist until a swap takes it.`,
      recovery: 'Korrin won’t place an order that would cross. No action needed unless it persists.',
      blocksNewOrders: false,
      evidencePaths: ['quote.bestBid', 'quote.bestAsk', 'quote.shape'],
    })
  }

  for (const a of ctx.pendingActions ?? []) {
    out.push({
      code: 'PENDING_TRANSACTION',
      severity: 'medium',
      title: 'A signed action isn’t confirmed yet',
      explanation: `${a.summary} is at the ${a.stage} stage. Korrin counts it only after reading the result back from the DEX.`,
      recovery: 'Wait for the readback. If it stays here, check the transaction on the explorer before signing again.',
      blocksNewOrders: false,
      evidencePaths: ['orders.pending'],
      ...(a.orderId ? { orderIds: [a.orderId] } : {}),
    })
  }

  for (const a of ctx.failedActions ?? []) {
    out.push({
      code: 'FAILED_ACTION',
      severity: 'medium',
      title: `${a.summary} didn’t complete`,
      explanation: a.error ?? 'The action failed before Korrin could confirm it.',
      recovery: 'Review the next step again. Korrin re-plans from a fresh read before you sign anything new.',
      blocksNewOrders: false,
      evidencePaths: ['mandate.decision'],
      ...(a.orderId ? { orderIds: [a.orderId] } : {}),
    })
  }

  if (ctx.flipFailedOrderIds?.length) {
    out.push({
      code: 'FLIP_FAILED',
      severity: 'high',
      title: 'A filled order failed to flip',
      explanation: 'The DEX emitted FlipFailed, so the filled amount did not come back to the book on the other side. It is not counted as liquidity.',
      recovery: 'Check the DEX balance for the proceeds and place a new order from the next step if the plan still needs it.',
      blocksNewOrders: false,
      evidencePaths: ['evidence.nativeOrderIds'],
      orderIds: ctx.flipFailedOrderIds,
    })
  }

  if (m) {
    const decisionException = m.decision ? DECISION_EXCEPTIONS[m.decision.reasonCode] : undefined
    if (decisionException && !paused) {
      out.push({ ...decisionException, explanation: m.decision?.cause ?? '', blocksNewOrders: true, evidencePaths: ['mandate.decision.reasonCode', 'mandate.decision.cause'] })
    }

    const fresh = !ctx.freshness.stale
    for (const side of ['bid', 'ask'] as const) {
      const cov = side === 'bid' ? m.coverageBid : m.coverageAsk
      const gap = side === 'bid' ? m.shortfallBid : m.shortfallAsk
      if (!fresh || cov.status !== 'SHORT' || paused) continue
      out.push({
        code: side === 'bid' ? 'DEPTH_SHORTFALL_BID' : 'DEPTH_SHORTFALL_ASK',
        severity: 'medium',
        title: `${side === 'bid' ? 'Bid' : 'Ask'} side is ${amt(gap.value)} short`,
        explanation: `${amt(side === 'bid' ? report.depth.ownBid.value : report.depth.ownAsk.value)} of your ${amt(side === 'bid' ? m.targetBid : m.targetAsk)} ${side} target is verified on the book (${Math.round((cov.ratio ?? 0) * 100)}%).`,
        recovery: shortfallRecovery(side, m.decision),
        blocksNewOrders: false,
        evidencePaths: [`mandate.coverage${side === 'bid' ? 'Bid' : 'Ask'}`, `mandate.shortfall${side === 'bid' ? 'Bid' : 'Ask'}`, `depth.own${side === 'bid' ? 'Bid' : 'Ask'}`],
      })
    }

    if (paused && report.orders.live > 0) {
      out.push({
        code: 'PAUSED_WITH_ORDERS',
        severity: 'medium',
        title: 'Paused, but orders are still on the book',
        explanation: `You paused this market, so Korrin proposes nothing new. ${report.orders.live} order(s) still rest on the book and can fill or flip.`,
        recovery: 'Cancel them from the Orders table if you want them off the book. Pausing alone never removes liquidity.',
        blocksNewOrders: true,
        evidencePaths: ['mandate.status', 'orders.live'],
        orderIds: report.orders.ids,
      })
    }

    const prev = ctx.previous?.mandate
    if (prev && fresh) {
      for (const side of ['bid', 'ask'] as const) {
        const was = side === 'bid' ? prev.coverageBid.status : prev.coverageAsk.status
        const now = side === 'bid' ? m.coverageBid.status : m.coverageAsk.status
        if (was === 'SHORT' && now === 'MET') {
          out.push({
            code: 'COVERAGE_RESTORED',
            severity: 'low',
            title: `${side === 'bid' ? 'Bid' : 'Ask'} target met again`,
            explanation: `Verified ${side} depth reached the target at block ${report.window.block}.`,
            recovery: 'Nothing to do.',
            blocksNewOrders: false,
            evidencePaths: [`mandate.coverage${side === 'bid' ? 'Bid' : 'Ask'}`],
          })
        }
      }
    }
  }

  if (scoped && report.inventory) {
    for (const token of ['quote', 'base'] as const) {
      const free = BigInt(report.inventory[token].dexInternalFree)
      if (free === 0n) continue
      const symbol = token === 'quote' ? report.market.quote : report.market.base
      out.push({
        code: 'DEX_BALANCE_IDLE',
        severity: 'low',
        title: `${formatAmount(free, d)} ${symbol} is waiting in your DEX balance`,
        explanation: 'Cancelled orders and fills land in the DEX’s internal balance, not your wallet. These funds are not quoting.',
        recovery: `Withdraw the ${symbol} from this market or from Controls to move it back to your wallet.`,
        blocksNewOrders: false,
        evidencePaths: [`inventory.${token}.dexInternalFree`],
      })
    }
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

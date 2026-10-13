import type { LiquidityMandate } from '../mandate/types'
import type { Proposal } from '../policy/plan'
import type { HealthInput, HealthLevel, HealthOwnOrder } from './types'

export type NetworkInfo = HealthInput['network']

/** Stable public identifier for a market: `<network>:<base>-<quote>` in lower case. */
export function marketIdFor(baseSymbol: string, quoteSymbol: string, network = 'tempo-moderato'): string {
  return `${network}:${baseSymbol.toLowerCase()}-${quoteSymbol.toLowerCase()}`
}

export type ObservationInput = { blockNumber: string; observedAtMs: number; bestBidTick: number; bestAskTick: number; levels: HealthLevel[]; tickSpacing: number }

/** The health input for an operator's own market: the mandate corridor is the band. */
export function mandateHealthInput(params: {
  network: NetworkInfo
  mandate: LiquidityMandate
  source: HealthInput['source']
  observation: ObservationInput | null
  observationError?: string
  ownOrders: HealthOwnOrder[]
  balances: HealthInput['balances']
  inflightActions: number
  /** The planner's decision for the same observation. A full Proposal fits this shape. */
  proposal: Pick<Proposal, 'kind' | 'cause' | 'action' | 'nextCondition'> & { reasonCode: string } | null
}): HealthInput {
  const m = params.mandate
  return {
    network: params.network,
    market: { marketId: marketIdFor(m.base.symbol, m.quote.symbol), base: m.base, quote: m.quote, bookKey: m.bookKey },
    source: params.source,
    observation: params.observation,
    observationError: params.observationError,
    maxAgeSeconds: m.maxDataAgeSeconds,
    band: { centerTick: m.targetTick, halfWidthTicks: m.bandTicks, basis: 'mandate' },
    mandate: {
      id: m.id,
      name: m.name,
      status: m.status,
      version: m.version,
      policyDigest: m.policyDigest,
      owner: m.owner,
      targetTick: m.targetTick,
      bandTicks: m.bandTicks,
      quoteOffsetTicks: m.quoteOffsetTicks,
      targetBidDepth: m.targetBidDepth,
      targetAskDepth: m.targetAskDepth,
      reserveBase: m.reserveBase,
      reserveQuote: m.reserveQuote,
      maxDataAgeSeconds: m.maxDataAgeSeconds,
    },
    ownOrders: params.ownOrders,
    balances: params.balances,
    inflightActions: params.inflightActions,
    decision: params.proposal ? { kind: params.proposal.kind, reasonCode: params.proposal.reasonCode, cause: params.proposal.cause, action: params.proposal.action, nextCondition: params.proposal.nextCondition } : undefined,
  }
}

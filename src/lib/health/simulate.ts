import type { LiquidityMandate } from '../mandate/types'
import { isValidPlacementTick, quoteForBase } from '../market/ticks'
import { mandateBand, type PlanningSnapshot, plan, type Proposal } from '../policy/plan'

export const SIMULATOR_VERSION = 'korrin-whatif/1.0.0'

export type PolicyOverrides = Partial<Pick<LiquidityMandate, 'targetBidDepth' | 'targetAskDepth' | 'bandTicks' | 'quoteOffsetTicks' | 'reserveBase' | 'reserveQuote' | 'maxOrderAmount' | 'maxBaseAllocation' | 'maxQuoteAllocation'>>

type Outcome = {
  kind: Proposal['kind']
  reasonCode: Proposal['reasonCode']
  action: string
  cause: string
  shortfallBid: string
  shortfallAsk: string
  coverageBid: number
  coverageAsk: number
  /** Funds needed to close both gaps at the plan's quote prices, versus what is free inside the allocation. */
  funding: { quoteNeeded: string; quoteAvailable: string | null; baseNeeded: string; baseAvailable: string | null }
}

export type SimulationResult =
  | { ok: false; errors: string[]; wasSimulated: true; engineVersion: string }
  | { ok: true; wasSimulated: true; engineVersion: string; changedFields: (keyof PolicyOverrides)[]; before: Outcome; after: Outcome; observationBlock: string }

function outcome(m: LiquidityMandate, p: Proposal): Outcome {
  const band = mandateBand(m)
  const quoteNeeded = quoteForBase(p.coverage.bid.shortfall, band.bidTick)
  const baseNeeded = p.coverage.ask.shortfall
  const free = (b: { free: bigint; allocationRemaining: bigint } | undefined) => (b ? (b.free < b.allocationRemaining ? b.free : b.allocationRemaining).toString() : null)
  return {
    kind: p.kind,
    reasonCode: p.reasonCode,
    action: p.action,
    cause: p.cause,
    shortfallBid: p.coverage.bid.shortfall.toString(),
    shortfallAsk: p.coverage.ask.shortfall.toString(),
    coverageBid: p.coverage.bid.ratio,
    coverageAsk: p.coverage.ask.ratio,
    funding: { quoteNeeded: quoteNeeded.toString(), quoteAvailable: free(p.inventory?.quote), baseNeeded: baseNeeded.toString(), baseAvailable: free(p.inventory?.base) },
  }
}

function validate(m: LiquidityMandate): string[] {
  const errors: string[] = []
  const nonNegative = (k: keyof PolicyOverrides) => {
    const v = m[k]
    if (typeof v === 'string' && (!/^\d+$/.test(v))) errors.push(`${k} must be a whole number of base units.`)
  }
  for (const k of ['targetBidDepth', 'targetAskDepth', 'reserveBase', 'reserveQuote', 'maxOrderAmount', 'maxBaseAllocation', 'maxQuoteAllocation'] as const) nonNegative(k)
  if (m.bandTicks < 10 || m.bandTicks > 500 || m.bandTicks % 10 !== 0) errors.push('The range must be 1 to 50 bp in whole basis points.')
  if (m.quoteOffsetTicks < 10 || m.quoteOffsetTicks % 10 !== 0) errors.push('The quote distance must be at least 1 bp in whole basis points.')
  if (m.quoteOffsetTicks > m.bandTicks) errors.push('The quote distance can’t be wider than the range.')
  const band = mandateBand(m)
  if (!isValidPlacementTick(band.bidTick) || !isValidPlacementTick(band.askTick)) errors.push('Quotes would fall outside the DEX price range.')
  return errors
}

/**
 * What-if analysis (PRD v2 §J4, INT-04). Runs the unchanged v1 planner on a copy
 * of the plan with the overrides applied, against the same frozen observation.
 * Never persists, never signs, never touches the saved plan.
 */
export function simulatePolicyChange(mandate: LiquidityMandate, snapshot: PlanningSnapshot, overrides: PolicyOverrides): SimulationResult {
  const candidate: LiquidityMandate = { ...mandate, ...overrides, status: mandate.status === 'paused' ? 'active' : mandate.status }
  const errors = validate(candidate)
  if (errors.length) return { ok: false, errors, wasSimulated: true, engineVersion: SIMULATOR_VERSION }
  const base: LiquidityMandate = { ...mandate, status: candidate.status }
  const changedFields = (Object.keys(overrides) as (keyof PolicyOverrides)[]).filter((k) => overrides[k] !== undefined && overrides[k] !== mandate[k]).sort()
  return {
    ok: true,
    wasSimulated: true,
    engineVersion: SIMULATOR_VERSION,
    changedFields,
    before: outcome(base, plan(base, snapshot)),
    after: outcome(candidate, plan(candidate, snapshot)),
    observationBlock: snapshot.blockNumber.toString(),
  }
}

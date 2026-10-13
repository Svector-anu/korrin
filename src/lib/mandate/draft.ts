import type { Address, Hex } from 'viem'
import { bpsToTicks, isValidPlacementTick, MAX_TICK, MIN_TICK, priceToTick, quoteForBase, snapToSpacing } from '../market/ticks'
import { tryToUnits } from '../units'
import { pickPolicy, policyDigest } from './digest'
import type { LiquidityMandate, TokenRef } from './types'

/** What the operator types. Strings so inputs can be edited freely. */
export type MandateDraft = {
  name: string
  targetPrice: string
  bandBps: number
  offsetBps: number
  targetBidDepth: string
  targetAskDepth: string
  maxOrderAmount: string
  maxQuoteAllocation: string
  maxBaseAllocation: string
  reserveQuote: string
  reserveBase: string
  maxInventorySharePct: number
  maxDataAgeSeconds: number
  maxActionsPerHour: number
}

export type DraftField = keyof MandateDraft

export function defaultDraft(pairLabel: string, midTick: number | null): MandateDraft {
  const target = midTick === null ? 0 : snapToSpacing(midTick)
  return {
    name: `${pairLabel} market`,
    targetPrice: ((100_000 + target) / 100_000).toFixed(4),
    bandBps: 10,
    offsetBps: 3,
    targetBidDepth: '500',
    targetAskDepth: '500',
    maxOrderAmount: '250',
    maxQuoteAllocation: '2000',
    maxBaseAllocation: '2000',
    reserveQuote: '100',
    reserveBase: '100',
    maxInventorySharePct: 75,
    maxDataAgeSeconds: 30,
    maxActionsPerHour: 12,
  }
}

export type DraftValidation = {
  errors: Partial<Record<DraftField, string>>
  warnings: string[]
  valid: boolean
  targetTick: number | null
}

export function validateDraft(d: MandateDraft, ctx: { decimals: number; minOrderAmount: bigint | null; baseSymbol: string; quoteSymbol: string }): DraftValidation {
  const errors: Partial<Record<DraftField, string>> = {}
  const warnings: string[] = []
  const amt = (field: DraftField, label: string, opts: { min?: bigint; allowZero?: boolean } = {}) => {
    const raw = String(d[field])
    const v = tryToUnits(raw, ctx.decimals)
    if (v === null) {
      errors[field] = `${label} must be a number with at most ${ctx.decimals} decimals.`
      return null
    }
    if (!opts.allowZero && v === 0n) {
      errors[field] = `${label} must be greater than zero.`
      return null
    }
    if (opts.min !== undefined && v < opts.min) {
      errors[field] = `${label} must be at least ${Number(opts.min) / 10 ** ctx.decimals}.`
      return null
    }
    return v
  }

  if (!d.name.trim()) errors.name = 'Give this market a name.'

  let targetTick: number | null = null
  const price = Number(d.targetPrice)
  if (!/^\d+(\.\d+)?$/.test(d.targetPrice.trim()) || !Number.isFinite(price)) {
    errors.targetPrice = 'Enter a price such as 1.0000.'
  } else {
    const raw = priceToTick(price)
    targetTick = snapToSpacing(raw)
    if (raw !== targetTick) warnings.push(`Target snaps to the 1 bp price grid: ${((100_000 + targetTick) / 100_000).toFixed(4)}.`)
    if (targetTick < MIN_TICK || targetTick > MAX_TICK) {
      errors.targetPrice = 'The DEX only quotes between 0.98 and 1.02.'
      targetTick = null
    }
  }

  if (d.bandBps < 1 || d.bandBps > 50) errors.bandBps = 'Choose a range between 1 and 50 bp either side.'
  if (d.offsetBps < 1) errors.offsetBps = 'Quote at least 1 bp from target, so bids and asks never share a price.'
  else if (d.offsetBps > d.bandBps) errors.offsetBps = 'Quotes must rest inside the corridor, so the quote distance can’t be wider than the range.'
  if (targetTick !== null && !errors.offsetBps) {
    const bid = targetTick - bpsToTicks(d.offsetBps)
    const ask = targetTick + bpsToTicks(d.offsetBps)
    if (!isValidPlacementTick(bid) || !isValidPlacementTick(ask)) errors.offsetBps = 'Quotes would fall outside the DEX price range.'
  }

  const bidDepth = amt('targetBidDepth', 'Bid target', { allowZero: true })
  const askDepth = amt('targetAskDepth', 'Ask target', { allowZero: true })
  if (bidDepth === 0n && askDepth === 0n) errors.targetBidDepth = 'Set a target for at least one side.'
  const maxOrder = amt('maxOrderAmount', 'Largest single order', { min: ctx.minOrderAmount ?? undefined })
  const quoteAlloc = amt('maxQuoteAllocation', 'Funds for bids', { allowZero: true })
  const baseAlloc = amt('maxBaseAllocation', 'Funds for asks', { allowZero: true })
  amt('reserveQuote', 'Amount kept in wallet', { allowZero: true })
  amt('reserveBase', 'Amount kept in wallet', { allowZero: true })

  if (targetTick !== null && bidDepth && quoteAlloc !== null && bidDepth > 0n) {
    const need = quoteForBase(bidDepth, targetTick - bpsToTicks(d.offsetBps))
    if (quoteAlloc < need) errors.maxQuoteAllocation = `Your bid target needs about ${(Number(need) / 10 ** ctx.decimals).toFixed(2)} ${ctx.quoteSymbol} set aside for bids.`
  }
  if (askDepth && baseAlloc !== null && askDepth > 0n && baseAlloc < askDepth) errors.maxBaseAllocation = `Your ask target needs ${Number(askDepth) / 10 ** ctx.decimals} ${ctx.baseSymbol} set aside for asks.`
  if (maxOrder && bidDepth && askDepth && maxOrder > (bidDepth > askDepth ? bidDepth : askDepth)) warnings.push('Your largest order is above both targets, so one order can fill a side on its own.')

  if (d.maxInventorySharePct < 50 || d.maxInventorySharePct > 100) errors.maxInventorySharePct = 'Use a share between 50% and 100%.'
  if (d.maxDataAgeSeconds < 5 || d.maxDataAgeSeconds > 300) errors.maxDataAgeSeconds = 'Choose between 5 and 300 seconds.'
  if (d.maxActionsPerHour < 1 || d.maxActionsPerHour > 120) errors.maxActionsPerHour = 'Allow between 1 and 120 orders per hour.'

  return { errors, warnings, valid: Object.keys(errors).length === 0, targetTick }
}

export function draftToMandate(
  d: MandateDraft,
  ctx: { id: string; owner: Address; chainId: number; base: TokenRef; quote: TokenRef; bookKey: Hex; targetTick: number; status: LiquidityMandate['status']; createdAt: string },
): LiquidityMandate {
  const u = (v: string) => (tryToUnits(v, ctx.base.decimals) ?? 0n).toString()
  const m: Omit<LiquidityMandate, 'policyDigest'> = {
    id: ctx.id,
    name: d.name.trim() || 'Untitled market',
    owner: ctx.owner,
    chainId: ctx.chainId,
    base: ctx.base,
    quote: ctx.quote,
    bookKey: ctx.bookKey,
    targetTick: ctx.targetTick,
    bandTicks: bpsToTicks(d.bandBps),
    quoteOffsetTicks: bpsToTicks(d.offsetBps),
    targetBidDepth: u(d.targetBidDepth),
    targetAskDepth: u(d.targetAskDepth),
    maxBaseAllocation: u(d.maxBaseAllocation),
    maxQuoteAllocation: u(d.maxQuoteAllocation),
    reserveBase: u(d.reserveBase),
    reserveQuote: u(d.reserveQuote),
    maxOrderAmount: u(d.maxOrderAmount),
    maxActionsPerHour: d.maxActionsPerHour,
    maxDataAgeSeconds: d.maxDataAgeSeconds,
    maxInventoryShareBps: Math.round(d.maxInventorySharePct * 100),
    executionMode: 'approval_required',
    status: ctx.status,
    version: 1,
    createdAt: ctx.createdAt,
    updatedAt: ctx.createdAt,
  }
  return { ...m, policyDigest: policyDigest(pickPolicy(m)) }
}

export function mandateToDraft(m: LiquidityMandate): MandateDraft {
  const f = (v: string) => (Number(v) / 10 ** m.base.decimals).toString()
  return {
    name: m.name,
    targetPrice: ((100_000 + m.targetTick) / 100_000).toFixed(4),
    bandBps: m.bandTicks / 10,
    offsetBps: m.quoteOffsetTicks / 10,
    targetBidDepth: f(m.targetBidDepth),
    targetAskDepth: f(m.targetAskDepth),
    maxOrderAmount: f(m.maxOrderAmount),
    maxQuoteAllocation: f(m.maxQuoteAllocation),
    maxBaseAllocation: f(m.maxBaseAllocation),
    reserveQuote: f(m.reserveQuote),
    reserveBase: f(m.reserveBase),
    maxInventorySharePct: m.maxInventoryShareBps / 100,
    maxDataAgeSeconds: m.maxDataAgeSeconds,
    maxActionsPerHour: m.maxActionsPerHour,
  }
}

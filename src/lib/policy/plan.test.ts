import { describe, expect, it } from 'vitest'
import { policyDigest, pickPolicy } from '../mandate/digest'
import type { LiquidityMandate } from '../mandate/types'
import { computeInventory, plan, type OwnOrderState, type PlanningSnapshot } from './plan'

const U = 1_000_000n
const NOW = 1_760_000_000_000

function mandate(overrides: Partial<LiquidityMandate> = {}): LiquidityMandate {
  const m: Omit<LiquidityMandate, 'policyDigest'> = {
    id: 'm1',
    name: 'Test',
    owner: '0x5C4d371C64FC0D6f82d6E7d19597ddd23a91267B',
    chainId: 42431,
    base: { address: '0x20c0000000000000000000000000000000000002', symbol: 'BetaUSD', decimals: 6 },
    quote: { address: '0x20c0000000000000000000000000000000000000', symbol: 'PathUSD', decimals: 6 },
    bookKey: '0x1d4a3d252ac88203ffa81ba59c52543fc9bf8976382b73bdfc08bc6dc5681d32',
    targetTick: 0,
    bandTicks: 100,
    quoteOffsetTicks: 30,
    targetBidDepth: (500n * U).toString(),
    targetAskDepth: (500n * U).toString(),
    maxBaseAllocation: (2_000n * U).toString(),
    maxQuoteAllocation: (2_000n * U).toString(),
    reserveBase: (100n * U).toString(),
    reserveQuote: (100n * U).toString(),
    maxOrderAmount: (250n * U).toString(),
    maxActionsPerHour: 12,
    maxDataAgeSeconds: 30,
    maxInventoryShareBps: 7_500,
    executionMode: 'approval_required',
    status: 'active',
    version: 1,
    createdAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z',
    ...overrides,
  }
  return { ...m, policyDigest: policyDigest(pickPolicy(m)) }
}

function snapshot(overrides: Partial<PlanningSnapshot> = {}): PlanningSnapshot {
  return {
    expectedChainId: 42431,
    chainId: 42431,
    marketSupported: true,
    basePaused: false,
    quotePaused: false,
    bestBidTick: -10,
    bestAskTick: 10,
    blockNumber: 39_202_854n,
    observedAtMs: NOW - 2_000,
    nowMs: NOW,
    ownOrders: [],
    balances: { base: { wallet: 10_000n * U, dex: 0n }, quote: { wallet: 10_000n * U, dex: 0n } },
    minOrderAmount: 100n * U,
    recentActionTimestampsMs: [],
    ...overrides,
  }
}

const resting = (o: Partial<OwnOrderState>): OwnOrderState => ({
  orderId: 1n,
  isBid: true,
  tick: -30,
  flipTick: 30,
  remaining: 250n * U,
  status: 'resting',
  ...o,
})

describe('plan', () => {
  it('places one bounded bid on the larger shortfall, capped by maxOrderAmount', () => {
    const p = plan(mandate(), snapshot())
    expect(p.kind).toBe('PLACE_BID')
    expect(p.reasonCode).toBe('depth_shortfall')
    expect(p.requiresApproval).toBe(true)
    expect(p.candidateOrder).toMatchObject({ side: 'buy', amount: 250n * U, tick: -30, flipTick: 30, escrowToken: 'quote' })
    expect(p.candidateOrder?.escrowAmount).toBe(249_925_000n)
  })

  it('places an ask when the ask side is further from target', () => {
    const p = plan(mandate(), snapshot({ ownOrders: [resting({ remaining: 400n * U })] }))
    expect(p.kind).toBe('PLACE_ASK')
    expect(p.candidateOrder).toMatchObject({ side: 'sell', tick: 30, flipTick: -30, escrowToken: 'base' })
  })

  it('keeps existing orders when both sides meet target', () => {
    const p = plan(
      mandate(),
      snapshot({ ownOrders: [resting({ orderId: 1n, remaining: 500n * U }), resting({ orderId: 2n, isBid: false, tick: 30, flipTick: -30, remaining: 500n * U })] }),
    )
    expect(p.kind).toBe('KEEP')
    expect(p.coverage.bid.ratio).toBe(1)
    expect(p.coverage.ask.ratio).toBe(1)
  })

  it('abstains on stale market data and says why', () => {
    const p = plan(mandate(), snapshot({ observedAtMs: NOW - 92_000 }))
    expect(p.kind).toBe('NO_ACTION')
    expect(p.reasonCode).toBe('stale_market')
    expect(p.cause).toBe('The last market read is 92s old. Your limit is 30s.')
    expect(p.candidateOrder).toBeUndefined()
  })

  it('blocks on the wrong chain', () => {
    expect(plan(mandate(), snapshot({ chainId: 4217 })).reasonCode).toBe('wrong_chain')
  })

  it('refuses unsupported markets and paused tokens', () => {
    expect(plan(mandate(), snapshot({ marketSupported: false })).reasonCode).toBe('unsupported_market')
    expect(plan(mandate(), snapshot({ basePaused: true })).reasonCode).toBe('token_paused')
  })

  it('never proposes while paused, even with a shortfall', () => {
    const p = plan(mandate({ status: 'paused' }), snapshot())
    expect(p.kind).toBe('NO_ACTION')
    expect(p.reasonCode).toBe('mandate_paused')
    expect(p.interpretation).toContain('Existing resting orders stay on the book')
  })

  it('abstains when balances cannot be read', () => {
    expect(plan(mandate(), snapshot({ balances: null })).reasonCode).toBe('balances_unreadable')
  })

  it('abstains while any tracked order is unreconciled', () => {
    const p = plan(mandate(), snapshot({ ownOrders: [resting({ status: 'unknown' })] }))
    expect(p.reasonCode).toBe('unreconciled_order')
  })

  it('protects the reserve floor', () => {
    const p = plan(mandate(), snapshot({ balances: { base: { wallet: 150n * U, dex: 0n }, quote: { wallet: 150n * U, dex: 0n } } }))
    expect(p.kind).toBe('NO_ACTION')
    expect(p.reasonCode).toBe('insufficient_free_inventory')
  })

  it('counts DEX-internal balance as spendable but never double counts escrow', () => {
    const m = mandate()
    const s = snapshot({
      balances: { base: { wallet: 0n, dex: 0n }, quote: { wallet: 50n * U, dex: 400n * U } },
      ownOrders: [resting({ remaining: 100n * U, tick: -30 })],
    })
    const inv = computeInventory(m, s)
    expect(inv?.quote.free).toBe(350n * U)
    expect(inv?.quote.committed).toBe(99_970_000n)
    expect(inv?.quote.reserved).toBe(100n * U)
  })

  it('rounds a small shortfall up to the DEX minimum when the cap allows', () => {
    const p = plan(mandate({ targetBidDepth: (300n * U).toString() }), snapshot({ ownOrders: [resting({ remaining: 250n * U }), resting({ orderId: 2n, isBid: false, tick: 30, remaining: 500n * U })] }))
    expect(p.kind).toBe('PLACE_BID')
    expect(p.candidateOrder?.amount).toBe(100n * U)
    expect(p.action).toContain('Rounded up to the DEX minimum')
  })

  it('refuses when the order cap is below the DEX minimum', () => {
    const p = plan(mandate({ maxOrderAmount: (50n * U).toString() }), snapshot())
    expect(p.reasonCode).toBe('below_minimum')
  })

  it('refuses to place a bid that would cross the best ask', () => {
    const p = plan(mandate({ quoteOffsetTicks: 10, targetAskDepth: '0' }), snapshot({ bestBidTick: -40, bestAskTick: -10 }))
    expect(p.reasonCode).toBe('would_cross')
  })

  it('holds when the market mid sits outside the corridor, and proposes pause when far outside', () => {
    expect(plan(mandate(), snapshot({ bestBidTick: 120, bestAskTick: 140 })).reasonCode).toBe('market_outside_band')
    const far = plan(mandate(), snapshot({ bestBidTick: 520, bestAskTick: 600 }))
    expect(far.kind).toBe('PAUSE')
    expect(far.reasonCode).toBe('market_far_outside_band')
  })

  it('proposes cancelling its own order that sits outside the corridor', () => {
    const p = plan(mandate(), snapshot({ ownOrders: [resting({ orderId: 77n, tick: 590 })] }))
    expect(p.kind).toBe('CANCEL')
    expect(p.cancelOrderId).toBe(77n)
    expect(p.action).toContain('DEX balance, not the wallet')
  })

  it('respects the hourly action limit', () => {
    const p = plan(mandate({ maxActionsPerHour: 2 }), snapshot({ recentActionTimestampsMs: [NOW - 60_000, NOW - 120_000] }))
    expect(p.reasonCode).toBe('action_rate_limit')
  })

  it('skips a side that already holds too much of the committed inventory', () => {
    const p = plan(
      mandate({ maxInventoryShareBps: 6_000, targetBidDepth: (1_000n * U).toString(), targetAskDepth: (600n * U).toString() }),
      snapshot({
        ownOrders: [resting({ remaining: 250n * U }), resting({ orderId: 2n, isBid: false, tick: 30, remaining: 100n * U })],
      }),
    )
    expect(p.kind).toBe('PLACE_ASK')
  })

  it('is deterministic for identical inputs', () => {
    const a = plan(mandate(), snapshot())
    const b = plan(mandate(), snapshot())
    expect(a.inputsDigest).toBe(b.inputsDigest)
    expect(a).toEqual(b)
  })
})

describe('policyDigest', () => {
  it('changes when any policy field changes and ignores status', () => {
    const a = mandate()
    expect(mandate({ status: 'paused' }).policyDigest).toBe(a.policyDigest)
    expect(mandate({ bandTicks: 90 }).policyDigest).not.toBe(a.policyDigest)
  })
})

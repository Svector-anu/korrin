import { describe, expect, it } from 'vitest'
import { defaultDraft, draftToMandate, mandateToDraft, validateDraft } from './draft'

const ctx = { decimals: 6, minOrderAmount: 100_000_000n, baseSymbol: 'BetaUSD', quoteSymbol: 'PathUSD' }

describe('validateDraft', () => {
  it('accepts the defaults centred on the market mid', () => {
    // #given
    const draft = defaultDraft('BetaUSD/PathUSD', 0)
    // #when
    const v = validateDraft(draft, ctx)
    // #then
    expect(v.valid).toBe(true)
  })

  it('snaps an off-grid target to the 1 bp grid and warns', () => {
    const v = validateDraft({ ...defaultDraft('x', 0), targetPrice: '1.00004' }, ctx)
    expect(v.targetTick).toBe(0)
    expect(v.warnings[0]).toContain('snaps')
  })

  it('rejects an order cap below the DEX minimum', () => {
    const v = validateDraft({ ...defaultDraft('x', 0), maxOrderAmount: '50' }, ctx)
    expect(v.errors.maxOrderAmount).toBeDefined()
  })

  it('rejects quotes outside the corridor', () => {
    const v = validateDraft({ ...defaultDraft('x', 0), bandBps: 2, offsetBps: 3 }, ctx)
    expect(v.errors.offsetBps).toContain('inside the corridor')
  })

  it('requires enough quote allocation to fund the bid target', () => {
    const v = validateDraft({ ...defaultDraft('x', 0), maxQuoteAllocation: '100' }, ctx)
    expect(v.errors.maxQuoteAllocation).toContain('PathUSD')
  })

  it('rejects prices outside the DEX range', () => {
    const v = validateDraft({ ...defaultDraft('x', 0), targetPrice: '1.5' }, ctx)
    expect(v.errors.targetPrice).toBeDefined()
  })

  it('rejects amounts with more than six decimals', () => {
    const v = validateDraft({ ...defaultDraft('x', 0), targetBidDepth: '1.0000001' }, ctx)
    expect(v.errors.targetBidDepth).toBeDefined()
  })
})

describe('draftToMandate', () => {
  it('round-trips through the draft form and produces a stable digest', () => {
    // #given
    const draft = defaultDraft('BetaUSD/PathUSD', 0)
    const args = {
      id: 'a',
      owner: '0x5C4d371C64FC0D6f82d6E7d19597ddd23a91267B' as const,
      chainId: 42431,
      base: { address: '0x20c0000000000000000000000000000000000002' as const, symbol: 'BetaUSD', decimals: 6 },
      quote: { address: '0x20c0000000000000000000000000000000000000' as const, symbol: 'PathUSD', decimals: 6 },
      bookKey: '0x1d4a3d252ac88203ffa81ba59c52543fc9bf8976382b73bdfc08bc6dc5681d32' as const,
      targetTick: 0,
      status: 'armed' as const,
      createdAt: '2026-10-12T00:00:00Z',
    }
    // #when
    const m = draftToMandate(draft, args)
    const again = draftToMandate(mandateToDraft(m), args)
    // #then
    expect(m.bandTicks).toBe(100)
    expect(m.quoteOffsetTicks).toBe(30)
    expect(m.targetBidDepth).toBe('500000000')
    expect(again.policyDigest).toBe(m.policyDigest)
  })
})

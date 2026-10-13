import { describe, expect, it } from 'vitest'
import { Tick } from 'viem/tempo'
import { formatAmount, fromUnits, toUnits } from '../units'
import { bpsToTicks, isValidPlacementTick, priceToTick, quoteForBase, snapToSpacing, tickToPrice } from './ticks'

describe('tick math', () => {
  it('matches the canonical ox Tick conversion', () => {
    for (const tick of [-2000, -590, -30, 0, 10, 490, 2000]) {
      expect(tickToPrice(tick)).toBeCloseTo(Number(Tick.toPrice(tick)), 10)
      expect(priceToTick(Number(Tick.toPrice(tick)))).toBe(Tick.fromPrice(Tick.toPrice(tick)))
    }
  })

  it('snaps to the 10-tick spacing and validates placement ticks', () => {
    expect(snapToSpacing(-34, 'down')).toBe(-40)
    expect(snapToSpacing(-34, 'up')).toBe(-30)
    expect(isValidPlacementTick(-30)).toBe(true)
    expect(isValidPlacementTick(-35)).toBe(false)
    expect(isValidPlacementTick(2010)).toBe(false)
    expect(bpsToTicks(25)).toBe(250)
  })

  it('reproduces the escrow observed on Moderato: 100 at tick -30 escrows 99.97', () => {
    expect(quoteForBase(100_000_000n, -30)).toBe(99_970_000n)
    expect(quoteForBase(1n, -30)).toBe(1n)
  })
})

describe('units', () => {
  it('parses and formats 6-decimal amounts exactly', () => {
    expect(toUnits('100', 6)).toBe(100_000_000n)
    expect(toUnits('0.000001', 6)).toBe(1n)
    expect(() => toUnits('0.0000001', 6)).toThrow()
    expect(() => toUnits('-1', 6)).toThrow()
    expect(fromUnits(99_970_000n, 6)).toBe('99.97')
    expect(formatAmount(1_234_567_890n, 6)).toBe('1,234.56')
  })
})

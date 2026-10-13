/**
 * Tempo Stablecoin DEX price grid, as read from the Moderato precompile:
 * price = 1 + tick / PRICE_SCALE, ticks in [MIN_TICK, MAX_TICK], placements on
 * multiples of TICK_SPACING. One tick is 0.1 bp, so one spacing step is 1 bp.
 */
export const PRICE_SCALE = 100_000
export const MIN_TICK = -2_000
export const MAX_TICK = 2_000
export const TICK_SPACING = 10
export const TICKS_PER_BP = 10

export function tickToPrice(tick: number): number {
  return (PRICE_SCALE + tick) / PRICE_SCALE
}

export function formatTickPrice(tick: number, digits = 4): string {
  return tickToPrice(tick).toFixed(digits)
}

export function priceToTick(price: number): number {
  return Math.round((price - 1) * PRICE_SCALE)
}

export function snapToSpacing(tick: number, mode: 'down' | 'up' | 'nearest' = 'nearest'): number {
  const q = tick / TICK_SPACING
  const snapped = mode === 'down' ? Math.floor(q) : mode === 'up' ? Math.ceil(q) : Math.round(q)
  return snapped * TICK_SPACING
}

export function isValidPlacementTick(tick: number): boolean {
  return Number.isInteger(tick) && tick % TICK_SPACING === 0 && tick >= MIN_TICK && tick <= MAX_TICK
}

export function bpsToTicks(bps: number): number {
  return Math.round(bps * TICKS_PER_BP)
}

export function ticksToBps(ticks: number): number {
  return ticks / TICKS_PER_BP
}

/** Quote-token units escrowed by a bid of `amount` base units at `tick`, rounded up. */
export function quoteForBase(amount: bigint, tick: number): bigint {
  const numerator = amount * BigInt(PRICE_SCALE + tick)
  const scale = BigInt(PRICE_SCALE)
  return (numerator + scale - 1n) / scale
}

/** Sentinel values the DEX returns for an empty side of a book. */
export const EMPTY_BID_TICK = -32_768
export const EMPTY_ASK_TICK = 32_767

export function hasBestBid(tick: number): boolean {
  return tick !== EMPTY_BID_TICK
}

export function hasBestAsk(tick: number): boolean {
  return tick !== EMPTY_ASK_TICK
}

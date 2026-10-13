import type { PlanningSnapshot } from '../policy/plan'

/** PlanningSnapshot with bigints as decimal strings, for sending to the analyst API. */
export type WirePlanning = Omit<PlanningSnapshot, 'blockNumber' | 'ownOrders' | 'balances' | 'minOrderAmount'> & {
  blockNumber: string
  minOrderAmount: string
  ownOrders: { orderId: string; isBid: boolean; tick: number; flipTick: number; remaining: string; status: 'resting' | 'unknown' }[]
  balances: { base: { wallet: string; dex: string }; quote: { wallet: string; dex: string } } | null
}

export function toWirePlanning(s: PlanningSnapshot): WirePlanning {
  return {
    ...s,
    blockNumber: s.blockNumber.toString(),
    minOrderAmount: s.minOrderAmount.toString(),
    ownOrders: s.ownOrders.map((o) => ({ ...o, orderId: o.orderId.toString(), remaining: o.remaining.toString() })),
    balances: s.balances ? { base: { wallet: s.balances.base.wallet.toString(), dex: s.balances.base.dex.toString() }, quote: { wallet: s.balances.quote.wallet.toString(), dex: s.balances.quote.dex.toString() } } : null,
  }
}

const int = (v: unknown) => {
  if (typeof v !== 'string' || !/^-?\d+$/.test(v)) throw new Error('Expected an integer string')
  return BigInt(v)
}

export function fromWirePlanning(w: WirePlanning): PlanningSnapshot {
  return {
    ...w,
    blockNumber: int(w.blockNumber),
    minOrderAmount: int(w.minOrderAmount),
    ownOrders: w.ownOrders.map((o) => ({ ...o, orderId: int(o.orderId), remaining: int(o.remaining) })),
    balances: w.balances ? { base: { wallet: int(w.balances.base.wallet), dex: int(w.balances.base.dex) }, quote: { wallet: int(w.balances.quote.wallet), dex: int(w.balances.quote.dex) } } : null,
  }
}

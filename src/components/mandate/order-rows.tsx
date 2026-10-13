import type { DetailRow } from '@/components/execution/execution-flow'
import type { LiquidityMandate } from '@/lib/mandate/types'
import { formatTickPrice, ticksToBps } from '@/lib/market/ticks'
import type { CandidateOrder } from '@/lib/policy/plan'
import { formatAmount } from '@/lib/units'

/** Exact native parameters for a placeFlip review, in the order the DEX takes them. */
export function placeRows(m: LiquidityMandate, o: CandidateOrder, minOrderAmount?: bigint): DetailRow[] {
  const d = m.base.decimals
  const side = o.side === 'buy' ? 'Bid (buy base)' : 'Ask (sell base)'
  return [
    { label: 'Market', value: `${m.base.symbol} / ${m.quote.symbol}` },
    { label: 'Call', value: 'StablecoinDEX.placeFlip', mono: true },
    { label: 'Side', value: side },
    { label: 'Amount', value: `${formatAmount(o.amount, d)} ${m.base.symbol}`, mono: true },
    { label: 'Price', value: `${formatTickPrice(o.tick, 5)} · tick ${o.tick} (${ticksToBps(o.tick - m.targetTick)} bp from target)`, mono: true },
    { label: 'When filled, flips to', value: `${formatTickPrice(o.flipTick, 5)} · tick ${o.flipTick}`, mono: true },
    { label: 'Held by the DEX while it rests', value: `${formatAmount(o.escrowAmount, d)} ${o.escrowToken === 'quote' ? m.quote.symbol : m.base.symbol}`, mono: true },
    ...(minOrderAmount !== undefined ? [{ label: 'DEX minimum', value: `${formatAmount(minOrderAmount, d, 0)} ${m.base.symbol}`, mono: true }] : []),
    { label: 'Fee', value: 'Paid in PathUSD, about 0.0002 per DEX call on Moderato' },
    { label: 'Approvals', value: 'None. The DEX escrows directly from the signer' },
  ]
}

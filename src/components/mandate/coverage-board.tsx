import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { SideCoverage } from '@/lib/policy/plan'
import { formatAmount } from '@/lib/units'

type SideInput = { target: bigint; coverage: SideCoverage | null }

/**
 * Target, verified depth and gap for both sides. "On the book" counts only orders
 * read back from the DEX inside the operator's range, never submitted transactions.
 */
export function CoverageBoard({ bid, ask, decimals, symbol, size = 'lg', className }: { bid: SideInput; ask: SideInput; decimals: number; symbol: string; size?: 'lg' | 'md'; className?: string }) {
  return (
    <div className={cn('grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-line shadow-[var(--shadow-card)] sm:grid-cols-2', className)}>
      <Side side="bid" input={bid} decimals={decimals} symbol={symbol} size={size} />
      <Side side="ask" input={ask} decimals={decimals} symbol={symbol} size={size} />
    </div>
  )
}

function Side({ side, input, decimals, symbol, size }: { side: 'bid' | 'ask'; input: SideInput; decimals: number; symbol: string; size: 'lg' | 'md' }) {
  const own = input.coverage?.own ?? null
  const gap = input.coverage?.shortfall ?? null
  const pct = input.coverage ? Math.min(100, input.coverage.ratio * 100) : 0
  const met = gap === 0n
  return (
    <div className="bg-surface px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[14px] text-ink-2">
          <span className={cn('size-2 rounded-full', side === 'bid' ? 'bg-bid' : 'bg-ask')} aria-hidden />
          {side === 'bid' ? 'Bids' : 'Asks'} on the book
        </span>
        <span className="text-[13px] text-muted">Target {formatAmount(input.target, decimals, 0)}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn('figure text-ink', size === 'lg' ? 'text-[44px]' : 'text-[34px]', own === null && 'text-faint')}>{own === null ? '—' : formatAmount(own, decimals)}</span>
        <span className="text-[14px] text-muted">{symbol}</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${side === 'bid' ? 'Bid' : 'Ask'} target reached`}>
        <div className={cn('h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-quiet)]', side === 'bid' ? 'bg-bid' : 'bg-ask')} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 text-[13.5px]">
        <span className="text-muted tabular-nums">{input.coverage ? `${pct.toFixed(0)}% of target` : 'Reading the book…'}</span>
        {gap !== null &&
          (met ? (
            <span className="inline-flex items-center gap-1 text-positive">
              <Check className="size-3.5" strokeWidth={2.25} /> Target met
            </span>
          ) : (
            <span className="text-ink">
              Gap <span className="tabular-nums">{formatAmount(gap, decimals)}</span>
            </span>
          ))}
      </div>
    </div>
  )
}

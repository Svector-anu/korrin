import { Clock, Lock, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { InventoryBreakdown, Proposal } from '@/lib/policy/plan'
import { formatAmount } from '@/lib/units'
import { ProposalKindBadge } from './decision'

function Bar({ value, total, className }: { value: bigint; total: bigint; className: string }) {
  const pct = total === 0n ? 0 : Math.min(100, Number((value * 10_000n) / total) / 100)
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={cn('h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out-quiet)]', className)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function CoverageMeter({ side, own, target, decimals, symbol }: { side: 'bid' | 'ask'; own: bigint; target: bigint; decimals: number; symbol: string }) {
  const ratio = target === 0n ? 1 : Math.min(1, Number((own * 10_000n) / target) / 10_000)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] text-ink-2">{side === 'bid' ? 'Bid coverage' : 'Ask coverage'}</span>
        <span className="tabular text-[13.5px] text-ink">
          {formatAmount(own, decimals)} <span className="text-muted">/ {formatAmount(target, decimals)} {symbol}</span>
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <Bar value={own} total={target === 0n ? 1n : target} className={side === 'bid' ? 'bg-bid' : 'bg-ask'} />
        <span className="tabular w-10 shrink-0 text-right text-[13px] text-muted">{(ratio * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}

/** Free / committed / reserved, kept disjoint per token so nothing is counted twice. */
export function CapitalAllocation({ inventory, decimals, baseSymbol, quoteSymbol }: { inventory: InventoryBreakdown | null; decimals: number; baseSymbol: string; quoteSymbol: string }) {
  if (!inventory) return <p className="text-[13.5px] text-muted">Balances are not readable yet. Korrin abstains until they are.</p>
  const rows = [
    { symbol: quoteSymbol, b: inventory.quote, side: 'Funds bids' },
    { symbol: baseSymbol, b: inventory.base, side: 'Funds asks' },
  ]
  return (
    <div className="space-y-4">
      {rows.map(({ symbol, b, side }) => {
        const total = b.free + b.committed + b.reserved
        const pct = (v: bigint) => (total === 0n ? 0 : Number((v * 10_000n) / total) / 100)
        return (
          <div key={symbol}>
            <div className="flex items-baseline justify-between">
              <span className="text-[13.5px] text-ink">
                {symbol} <span className="text-muted">· {side}</span>
              </span>
              <span className="tabular text-[13px] text-muted">{formatAmount(total, decimals)}</span>
            </div>
            <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="h-full bg-structural/80 transition-[width] duration-300" style={{ width: `${pct(b.committed)}%` }} />
              <span className="h-full bg-[repeating-linear-gradient(135deg,var(--ink-faint)_0_2px,transparent_2px_4px)] transition-[width] duration-300" style={{ width: `${pct(b.reserved)}%` }} />
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
              <Stat icon={<ShieldCheck className="size-3" />} label="Free" value={formatAmount(b.free, decimals)} />
              <Stat icon={<Lock className="size-3" />} label="Committed" value={formatAmount(b.committed, decimals)} />
              <Stat icon={<Clock className="size-3" />} label="Reserved" value={formatAmount(b.reserved, decimals)} />
            </dl>
            <div className="label mt-1">Allocation left for new orders: {formatAmount(b.allocationRemaining, decimals)}</div>
          </div>
        )
      })}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-muted">
        {icon}
        {label}
      </dt>
      <dd className="tabular mt-0.5 truncate text-ink">{value}</dd>
    </div>
  )
}

export function NextStep({ proposal }: { proposal: Proposal | null }) {
  if (!proposal) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <ProposalKindBadge kind={proposal.kind} />
        <span className="text-[13px] text-muted">{proposal.requiresApproval ? 'Needs your signature' : 'No signature needed'}</span>
      </div>
      {proposal.nextCondition && (
        <p className="text-[13.5px] leading-snug text-ink-2">
          <span className="text-muted">Changes when: </span>
          {proposal.nextCondition}
        </p>
      )}
    </div>
  )
}

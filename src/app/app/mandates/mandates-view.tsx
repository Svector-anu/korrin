'use client'

import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { MandateStatusPill } from '@/components/mandate/status'
import { ButtonLink } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/states'
import { PairLabel } from '@/components/ui/token'
import { useAttention } from '@/lib/client/attention'
import type { OrderDto } from '@/lib/client/data'
import { useHydrated, useMandates, useOrders } from '@/lib/client/store'
import { cn } from '@/lib/cn'
import type { LiquidityMandate } from '@/lib/mandate/types'
import { formatTickPrice } from '@/lib/market/ticks'
import { formatAmount } from '@/lib/units'

export function MandatesView() {
  const hydrated = useHydrated()
  const mandates = useMandates()
  const orders = useOrders()
  const { byId } = useAttention()
  const sorted = useMemo(() => [...mandates].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [mandates])
  const liveFor = (id: string) =>
    orders
      .filter((o) => o.mandateId === id && !o.closedAt)
      .map((o) => byId.get(o.orderId))
      .filter((x): x is OrderDto => Boolean(x))

  return (
    <>
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="page-title">Your markets</h1>
          <p className="prose-body mt-2 max-w-[60ch] text-muted">Each market is a plan you own: a target price, how far either side you’ll quote, and how much. Korrin proposes orders inside it, and you approve each one.</p>
        </div>
        <ButtonLink href="/app/mandates/new" variant="primary" icon={<Plus className="size-4" />}>
          Set up a market
        </ButtonLink>
      </header>

      {!hydrated ? (
        <LoadingState label="Loading your markets" />
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {sorted.map((m) => (
            <li key={m.id}>
              <MarketCard mandate={m} orders={liveFor(m.id)} />
            </li>
          ))}
          <li>
            <Link
              href="/app/mandates/new"
              className="flex h-full min-h-[236px] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 text-center transition-colors duration-150 hover:bg-hover"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-recessed text-ink-2">
                <Plus className="size-5" strokeWidth={1.6} />
              </span>
              <span className="text-[16px] font-medium text-ink">{sorted.length ? 'Set up another market' : 'Your first market starts here'}</span>
              <span className="max-w-[34ch] text-[14px] leading-snug text-muted">Choose a stablecoin pair, set your range and sizes, then approve the first order.</span>
            </Link>
          </li>
        </ul>
      )}
    </>
  )
}

function MarketCard({ mandate, orders }: { mandate: LiquidityMandate; orders: OrderDto[] }) {
  const inBand = (t: number) => t >= mandate.targetTick - mandate.bandTicks && t <= mandate.targetTick + mandate.bandTicks
  const own = (bid: boolean) => orders.reduce((a, o) => (o.status === 'live' && o.isBid === bid && inBand(o.tick) ? a + BigInt(o.remaining) : a), 0n)
  const live = orders.filter((o) => o.status === 'live').length
  const sides: [string, bigint, bigint, string][] = [
    ['Bids', own(true), BigInt(mandate.targetBidDepth), 'bg-bid'],
    ['Asks', own(false), BigInt(mandate.targetAskDepth), 'bg-ask'],
  ]
  return (
    <Link href={`/app/mandates/${mandate.id}`} className="card flex h-full flex-col px-5 py-5 transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-float)]">
      <div className="flex items-start justify-between gap-3">
        <PairLabel base={mandate.base} quote={mandate.quote} size={28} className="gap-2.5 text-[17px]" />
        <MandateStatusPill status={mandate.status} />
      </div>
      <p className="mt-2 flex min-w-0 gap-3 text-[14px] text-muted">
        <span className="truncate">{mandate.name}</span>
        <span className="shrink-0">
          <span className="tabular text-ink-2">{formatTickPrice(mandate.targetTick)}</span> ±{mandate.bandTicks / 10} bp
        </span>
      </p>
      <div className="mt-6 space-y-3.5">
        {sides.map(([label, v, target, cls]) => {
          const pct = target === 0n ? 100 : Math.min(100, Number((v * 10_000n) / target) / 100)
          return (
            <div key={label}>
              <div className="flex items-baseline justify-between text-[13.5px]">
                <span className="text-ink-2">{label} on the book</span>
                <span className="text-muted tabular-nums">
                  <span className="text-ink">{formatAmount(v, mandate.base.decimals, 0)}</span> of {formatAmount(target, mandate.base.decimals, 0)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className={cn('h-full rounded-full', cls)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="min-h-6 flex-1" />
      <div className="hairline-t flex items-center justify-between border-line pt-4 text-[13.5px] text-muted">
        <span>
          {live} {live === 1 ? 'order' : 'orders'} on the book
        </span>
        <span className="inline-flex items-center gap-1 text-ink-2">
          Open market <ChevronRight className="size-4" />
        </span>
      </div>
    </Link>
  )
}

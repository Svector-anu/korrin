'use client'

import { ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { buildLevels, type CorridorModel } from '@/components/corridor/model'
import { LiquidityCorridor } from '@/components/corridor/liquidity-corridor'
import { Button, ButtonLink } from '@/components/ui/button'
import { type Column, DataTable } from '@/components/ui/data-table'
import { Segmented } from '@/components/ui/fields'
import { Panel } from '@/components/ui/panel'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { SignalDot, StatusPill } from '@/components/ui/status'
import { PairLabel } from '@/components/ui/token'
import { Tooltip } from '@/components/ui/tooltip'
import { ageLabel, type MarketDto, useMarkets, useNow, useSnapshot } from '@/lib/client/data'
import { bestPrice, bookShape, midTick, spreadBps } from '@/lib/market/book'
import { formatTickPrice, hasBestAsk, hasBestBid, snapToSpacing } from '@/lib/market/ticks'

export function MarketsView() {
  const markets = useMarkets()
  const now = useNow()
  const router = useRouter()
  const [scope, setScope] = useState<'faucet' | 'all'>('faucet')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const rows = useMemo(() => (markets.data?.markets ?? []).filter((m) => scope === 'all' || m.canonical), [markets.data, scope])

  const columns: Column<MarketDto>[] = [
    {
      key: 'pair',
      header: 'Pair',
      render: (m) => <PairLabel base={m.base} quote={m.quote} />,
      sortValue: (m) => m.base.symbol.toLowerCase(),
    },
    { key: 'bid', header: 'Best bid', align: 'right', render: (m) => <span className="tabular text-bid">{bestPrice(m.bestBidTick, 'bid')}</span>, sortValue: (m) => m.bestBidTick },
    { key: 'ask', header: 'Best ask', align: 'right', render: (m) => <span className="tabular text-ask">{bestPrice(m.bestAskTick, 'ask')}</span>, sortValue: (m) => m.bestAskTick },
    {
      key: 'spread',
      header: 'Spread',
      align: 'right',
      render: (m) => {
        const s = spreadBps(m.bestBidTick, m.bestAskTick)
        return <span className="tabular text-ink">{s === null ? '—' : `${s.toFixed(1)} bp`}</span>
      },
      sortValue: (m) => spreadBps(m.bestBidTick, m.bestAskTick) ?? 1e9,
    },
    {
      key: 'shape',
      header: 'Book',
      hideBelow: 'sm',
      render: (m) => {
        const shape = bookShape(m.bestBidTick, m.bestAskTick)
        const tone = shape === 'two-sided' ? 'positive' : shape === 'empty' ? 'unknown' : shape === 'crossed' || shape === 'locked' ? 'info' : 'hold'
        const pill = <StatusPill tone={tone}>{shape}</StatusPill>
        return shape === 'crossed' || shape === 'locked' ? (
          <Tooltip content={`Best bid ${shape === 'crossed' ? 'sits above' : 'equals'} best ask. Tempo's place() rests orders without matching, so this can persist until a swap takes it.`}>
            <span>{pill}</span>
          </Tooltip>
        ) : (
          pill
        )
      },
    },
    {
      key: 'open',
      header: <span className="sr-only">Open</span>,
      align: 'right',
      render: (m) => (
        <ButtonLink href={`/app/markets/${m.base.address}`} size="sm" variant="ghost" iconOnly aria-label={`Open the ${m.base.symbol} book`} onClick={(e) => e.stopPropagation()}>
          <ChevronRight className="size-4" />
        </ButtonLink>
      ),
    },
  ]

  const selected = rows.find((m) => m.bookKey === selectedKey) ?? rows[0] ?? null

  return (
    <>
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="page-title">Order books</h1>
          <p className="prose-body mt-2 max-w-[62ch] text-muted">Every stablecoin pair on Tempo’s DEX, read straight from chain. Pick one to see where liquidity sits, then set up a market on it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
          <SignalDot state={markets.error ? 'offline' : markets.receivedAt ? 'live' : 'idle'} label={markets.data ? `Block #${Number(markets.data.blockNumber).toLocaleString('en-US')}` : 'Reading books'} />
          <span>Read {ageLabel(markets.data?.observedAt ?? null, now)}</span>
          <Button variant="ghost" size="sm" onClick={markets.refresh} loading={markets.loading} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel className="min-w-0">
          <div className="hairline-b flex flex-wrap items-center justify-between gap-3 border-line px-5 py-3.5">
            <Segmented
              label="Which books"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'faucet', label: 'Testnet USD tokens' },
                { value: 'all', label: `All books${markets.data ? ` (${markets.data.markets.length})` : ''}` },
              ]}
            />
            {markets.data && <span className="text-[13px] text-muted">via {markets.data.source}</span>}
          </div>
          {markets.error && !markets.data && (
            <div className="p-5">
              <ErrorState title="The books couldn’t be read" reason={markets.error} recovery={<Button size="sm" onClick={markets.refresh}>Try again</Button>} />
            </div>
          )}
          <DataTable
            caption="Stablecoin DEX books"
            columns={columns}
            rows={rows}
            rowKey={(m) => m.bookKey}
            selectedKey={selected?.bookKey}
            onRowClick={(m) => setSelectedKey(m.bookKey)}
            loading={markets.loading && !markets.data}
            initialSort={{ key: 'pair', dir: 'asc' }}
            empty={<EmptyState title="No books here" body="Switch to all books to see pairs other people created." />}
          />
          {scope === 'all' && markets.data && markets.data.skipped > 0 && (
            <p className="hairline-t border-line px-5 py-3 text-[13px] text-muted">{markets.data.skipped} books were skipped because their tokens didn’t return TIP-20 metadata.</p>
          )}
        </Panel>
        <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">{selected ? <BookPreview market={selected} onOpen={() => router.push(`/app/markets/${selected.base.address}`)} /> : null}</div>
      </div>
    </>
  )
}

function BookPreview({ market, onOpen }: { market: MarketDto; onOpen: () => void }) {
  const center = snapToSpacing(midTick(market.bestBidTick, market.bestAskTick) ?? (hasBestBid(market.bestBidTick) ? market.bestBidTick : hasBestAsk(market.bestAskTick) ? market.bestAskTick : 0))
  const window = useMemo(() => ({ from: center - 100, to: center + 100 }), [center])
  const snap = useSnapshot(market.base.address, market.quote.address, window, 15_000)
  const spread = spreadBps(market.bestBidTick, market.bestAskTick)
  const model = useMemo<CorridorModel | null>(
    () =>
      snap.data
        ? {
            from: window.from,
            to: window.to,
            targetTick: center,
            targetLabel: 'Mid',
            bandTicks: 0,
            bestBidTick: hasBestBid(snap.data.bestBidTick) ? snap.data.bestBidTick : null,
            bestAskTick: hasBestAsk(snap.data.bestAskTick) ? snap.data.bestAskTick : null,
            levels: buildLevels(snap.data.levels, [], window.from, window.to, snap.data.bestBidTick, snap.data.bestAskTick),
            orders: [],
            proposal: null,
            coverage: null,
            decimals: snap.data.base.decimals,
            baseSymbol: snap.data.base.symbol,
            quoteSymbol: snap.data.quote.symbol,
          }
        : null,
    [snap.data, window, center],
  )
  return (
    <section className="card overflow-hidden">
      <div className="px-5 pt-5">
        <PairLabel base={market.base} quote={market.quote} size={30} className="gap-3 text-[20px]" labelClassName="font-display text-structural" />
        <dl className="mt-5 grid grid-cols-3 gap-3">
          {[
            ['Best bid', hasBestBid(market.bestBidTick) ? formatTickPrice(market.bestBidTick) : '—', 'text-bid'],
            ['Best ask', hasBestAsk(market.bestAskTick) ? formatTickPrice(market.bestAskTick) : '—', 'text-ask'],
            ['Spread', spread === null ? '—' : `${spread.toFixed(1)} bp`, 'text-ink'],
          ].map(([k, v, cls]) => (
            <div key={k}>
              <dt className="label">{k}</dt>
              <dd className={`figure mt-1.5 text-[22px] ${cls}`}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-4 px-2">
        {model ? <LiquidityCorridor model={model} height={220} caption={`${market.base.symbol}/${market.quote.symbol} liquidity near the mid`} /> : snap.error ? <p className="px-3 py-6 text-[14px] text-muted">The levels couldn’t be read: {snap.error}</p> : <LoadingState label="Reading levels near the mid" />}
      </div>
      <div className="hairline-t flex flex-wrap gap-2 border-line px-5 py-4">
        <ButtonLink href={`/app/mandates/new?base=${market.base.address}`} variant="primary" icon={<Plus className="size-4" />}>
          Set up a market here
        </ButtonLink>
        <Button onClick={onOpen}>Open book</Button>
      </div>
    </section>
  )
}

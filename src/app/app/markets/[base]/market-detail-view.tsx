'use client'

import { ArrowLeft, ExternalLink, Plus, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { use, useMemo, useState } from 'react'
import { isAddress } from 'viem'
import { buildLevels, type CorridorModel } from '@/components/corridor/model'
import { LiquidityCorridor } from '@/components/corridor/liquidity-corridor'
import { Button, ButtonLink } from '@/components/ui/button'
import { Segmented } from '@/components/ui/fields'
import { KeyValue, MetricReadout, PageHeader, Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { SignalDot, SourceBadge, StatusPill } from '@/components/ui/status'
import { PairLabel, TokenIcon } from '@/components/ui/token'
import { ageLabel, type SnapshotDto, useMarkets, useNow, useSnapshot } from '@/lib/client/data'
import { bookShape, midTick, spreadBps } from '@/lib/market/book'
import { formatTickPrice, hasBestAsk, hasBestBid, snapToSpacing } from '@/lib/market/ticks'
import { explorerAddress, shortHex } from '@/lib/tempo/chain'
import { formatAmount, formatCompact } from '@/lib/units'

const WINDOWS = [
  { value: '50', label: '±5 bp' },
  { value: '100', label: '±10 bp' },
  { value: '250', label: '±25 bp' },
] as const

export function MarketDetailView({ params }: { params: Promise<{ base: string }> }) {
  const { base } = use(params)
  const markets = useMarkets()
  const market = markets.data?.markets.find((m) => m.base.address.toLowerCase() === base.toLowerCase())
  const [half, setHalf] = useState<(typeof WINDOWS)[number]['value']>('100')
  const center = market ? snapToSpacing(midTick(market.bestBidTick, market.bestAskTick) ?? (hasBestBid(market.bestBidTick) ? market.bestBidTick : hasBestAsk(market.bestAskTick) ? market.bestAskTick : 0)) : null
  const window = center === null ? null : { from: center - Number(half), to: center + Number(half) }
  const snap = useSnapshot(isAddress(base) && market ? base : null, market?.quote.address ?? null, window)
  const now = useNow()

  if (!isAddress(base)) return <ErrorState title="Not a token address" reason={`"${base}" is not a valid address.`} />
  if (markets.error && !markets.data) return <ErrorState title="Books could not be read" reason={markets.error} />
  if (!markets.data) return <LoadingState label="Reading DEX books" />
  if (!market)
    return (
      <Panel>
        <EmptyState title="No book for this token" body="The Stablecoin DEX has no pair with this base token. Korrin only works with books it can read from chain." actions={<ButtonLink href="/app/markets">Back to markets</ButtonLink>} />
      </Panel>
    )

  const shape = bookShape(market.bestBidTick, market.bestAskTick)
  const spread = spreadBps(market.bestBidTick, market.bestAskTick)
  const data = snap.data
  const stale = snap.receivedAt ? now - snap.receivedAt > 30_000 : false

  return (
    <>
      <Link href="/app/markets" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] text-muted transition-colors hover:text-ink">
        <ArrowLeft className="size-3.5" /> Markets
      </Link>
      <PageHeader
        meta={
          <>
            <StatusPill tone={shape === 'two-sided' ? 'positive' : 'info'}>{shape}</StatusPill>
            <StatusPill tone="neutral">Testnet</StatusPill>
          </>
        }
        title={<PairLabel base={market.base} quote={market.quote} size={26} className="gap-3 text-[26px] font-display font-normal tracking-[-0.03em]" />}
        description={`${market.base.name} quoted in ${market.quote.name} on the Tempo Stablecoin DEX. Book #${market.index}.`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={snap.refresh} loading={snap.loading} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
            <ButtonLink href={`/app/mandates/new?base=${market.base.address}`} variant="primary" icon={<Plus className="size-3.5" />}>
              Set up a market here
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-line shadow-[var(--shadow-card)] sm:grid-cols-3 lg:grid-cols-6">
        {[
          <MetricReadout key="b" label="Best bid" value={hasBestBid(market.bestBidTick) ? formatTickPrice(market.bestBidTick) : '—'} tone="bid" detail={`tick ${market.bestBidTick}`} />,
          <MetricReadout key="a" label="Best ask" value={hasBestAsk(market.bestAskTick) ? formatTickPrice(market.bestAskTick) : '—'} tone="ask" detail={`tick ${market.bestAskTick}`} />,
          <MetricReadout key="s" label="Spread" value={spread === null ? '—' : spread.toFixed(1)} unit={spread === null ? undefined : 'bp'} detail={shape === 'crossed' ? 'bid above ask' : shape === 'locked' ? 'bid equals ask' : 'best ask − best bid'} />,
          <MetricReadout key="m" label="Mid" value={midTick(market.bestBidTick, market.bestAskTick) === null ? '—' : formatTickPrice(Math.round(midTick(market.bestBidTick, market.bestAskTick) ?? 0), 5)} detail={market.quote.symbol} />,
          <MetricReadout key="o" label="DEX minimum order" value={data ? formatAmount(BigInt(data.constants.minOrderAmount), market.base.decimals, 0) : '—'} unit={market.base.symbol} detail="MIN_ORDER_AMOUNT" />,
          <MetricReadout key="t" label="Price step" value={data ? `${data.constants.tickSpacing / 10}` : '—'} unit="bp" detail={data ? `TICK_SPACING ${data.constants.tickSpacing}` : undefined} />,
        ].map((m, i) => (
          <div key={i} className="bg-surface px-5 py-4">
            {m}
          </div>
        ))}
      </div>

      <Panel className="mt-4">
        <PanelHeader
          title="Liquidity by price level"
          description="Resting liquidity per tick around the mid, read with getTickLevel. Levels the RPC cannot read are marked rather than drawn as empty."
          actions={<Segmented label="Window" value={half} onChange={setHalf} options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />}
        />
        <div className="px-3 pb-4 md:px-5">
          {snap.error && !data && <ErrorState title="Level read failed" reason={snap.error} />}
          {!data && !snap.error && <LoadingState label="Reading tick levels from Tempo" />}
          {data && window && <CorridorFromSnapshot data={data} window={window} center={center ?? 0} />}
        </div>
        <div className="hairline-t flex flex-wrap items-center gap-x-5 gap-y-1 border-line px-5 py-3 text-[13px] text-muted">
          <SourceBadge source="onchain" />
          <SignalDot state={snap.error ? 'offline' : stale ? 'stale' : snap.receivedAt ? 'live' : 'idle'} label={data ? `Block #${Number(data.blockNumber).toLocaleString('en-US')}` : 'Waiting for first read'} />
          <span>Observed {ageLabel(data?.observedAt ?? null, now)}</span>
          {data && <span>{data.levels.filter((l) => l.status === 'unreadable').length} of {data.levels.length} levels unreadable</span>}
          {data && <span className="ml-auto">via {data.source}</span>}
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader title="Executable now" description="quoteSwapExactAmountIn against the live book. What a taker would receive right now, before fees." />
          {data ? <QuoteTable data={data} /> : <LoadingState label="Quoting" />}
        </Panel>
        <Panel>
          <PanelHeader title="Tokens" description="TIP-20 metadata read from each token contract." />
          <div className="divide-y divide-line-faint px-5 pb-3">
            {[market.base, market.quote].map((t) => (
              <div key={t.address} className="py-3">
                <div className="flex items-center gap-2.5">
                  <TokenIcon address={t.address} symbol={t.symbol} size={22} />
                  <span className="text-[14.5px] font-medium text-ink">{t.symbol}</span>
                  <span className="text-[13.5px] text-muted">{t.name}</span>
                  {t.paused ? <StatusPill tone="negative">Paused</StatusPill> : <StatusPill tone="positive">Active</StatusPill>}
                </div>
                <dl className="mt-1.5">
                  <KeyValue label="Address" mono>
                    <a className="inline-flex items-center gap-1 hover:text-accent" href={explorerAddress(t.address)} target="_blank" rel="noreferrer">
                      {shortHex(t.address, 6, 6)} <ExternalLink className="size-3" />
                    </a>
                  </KeyValue>
                  <KeyValue label="Decimals" mono>
                    {t.decimals}
                  </KeyValue>
                  <KeyValue label="Currency">{t.currency}</KeyValue>
                  <KeyValue label="Quote token" mono={Boolean(t.quoteToken && !/^0x0+$/.test(t.quoteToken))}>
                    {t.quoteToken && !/^0x0+$/.test(t.quoteToken) ? shortHex(t.quoteToken, 6, 6) : 'None. Root quote token'}
                  </KeyValue>
                </dl>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}

function CorridorFromSnapshot({ data, window, center }: { data: SnapshotDto; window: { from: number; to: number }; center: number }) {
  const model = useMemo<CorridorModel>(
    () => ({
      from: window.from,
      to: window.to,
      targetTick: center,
      targetLabel: 'Mid',
      bandTicks: 0,
      bestBidTick: hasBestBid(data.bestBidTick) ? data.bestBidTick : null,
      bestAskTick: hasBestAsk(data.bestAskTick) ? data.bestAskTick : null,
      levels: buildLevels(data.levels, [], window.from, window.to, data.bestBidTick, data.bestAskTick),
      orders: [],
      proposal: null,
      coverage: null,
      decimals: data.base.decimals,
      baseSymbol: data.base.symbol,
      quoteSymbol: data.quote.symbol,
    }),
    [data, window.from, window.to, center],
  )
  return <LiquidityCorridor model={model} height={300} caption={`${data.base.symbol}/${data.quote.symbol} liquidity by level`} />
}

function QuoteTable({ data }: { data: SnapshotDto }) {
  const d = data.base.decimals
  return (
    <table className="w-full text-[14px]">
      <thead>
        <tr className="hairline-b border-line text-[12.5px] text-muted">
          <th className="px-5 py-2 text-left font-normal">Taker trade</th>
          <th className="px-4 py-2 text-right font-normal">Receives</th>
          <th className="px-5 py-2 text-right font-normal">Average price</th>
        </tr>
      </thead>
      <tbody>
        {data.quotes.map((q) => {
          const inAmt = BigInt(q.amountIn)
          const out = q.amountOut === null ? null : BigInt(q.amountOut)
          const sell = q.side === 'sell_base'
          const avg = out === null || out === 0n ? null : sell ? Number(out) / Number(inAmt) : Number(inAmt) / Number(out)
          return (
            <tr key={`${q.side}-${q.amountIn}`} className="hairline-b border-line-faint last:border-b-0">
              <td className="px-5 py-2.5">
                <span className={sell ? 'text-bid' : 'text-ask'}>{sell ? 'Sell' : 'Buy with'}</span>{' '}
                <span className="tabular text-ink">{formatCompact(inAmt, d)}</span> <span className="text-muted">{sell ? data.base.symbol : data.quote.symbol}</span>
              </td>
              <td className="tabular px-4 py-2.5 text-right text-ink">
                {out === null ? <span className="font-sans text-muted">{q.error ?? 'unavailable'}</span> : `${formatAmount(out, d)} `}
                {out !== null && <span className="font-sans text-[13px] text-muted">{sell ? data.quote.symbol : data.base.symbol}</span>}
              </td>
              <td className="tabular px-5 py-2.5 text-right text-ink">{avg === null ? '—' : avg.toFixed(6)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

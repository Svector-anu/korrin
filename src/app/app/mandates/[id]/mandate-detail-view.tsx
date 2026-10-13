'use client'

import { ArrowLeft, Ban, ChevronDown, ExternalLink, Eye, MessageSquareText, Pause, Play, RefreshCw, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { use, useEffect, useMemo, useState } from 'react'
import { LiquidityCorridor } from '@/components/corridor/liquidity-corridor'
import { ExecutionFlow } from '@/components/execution/execution-flow'
import { actionToItem, eventToItem, Timeline, type TimelineItem, sortTimeline } from '@/components/execution/timeline'
import { TransactionDrawer } from '@/components/execution/transaction-drawer'
import { AnalystDrawer } from '@/components/analyst/analyst-drawer'
import { ExceptionsPanel } from '@/components/health/exceptions-panel'
import { ReportPanel } from '@/components/health/report-panel'
import { WhatIfPanel } from '@/components/health/whatif-panel'
import { CoverageBoard } from '@/components/mandate/coverage-board'
import { NextOrderCard } from '@/components/mandate/decision'
import { CapitalAllocation } from '@/components/mandate/health'
import { placeRows } from '@/components/mandate/order-rows'
import { ShareReport } from '@/components/mandate/share-report'
import { MandateStatusPill } from '@/components/mandate/status'
import { Button, ButtonLink } from '@/components/ui/button'
import { KeyValue, Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { SignalDot, SourceBadge, StatusPill } from '@/components/ui/status'
import { PairLabel } from '@/components/ui/token'
import { Tooltip } from '@/components/ui/tooltip'
import { ageLabel, useEventsFor } from '@/lib/client/data'
import { cancelMandateOrder, placeMandateOrder, withdrawDexBalance } from '@/lib/client/execute'
import { useActiveSigner } from '@/lib/client/signer'
import { patchMandate, recordAction, useActions, useHydrated, useMandates, useOrders } from '@/lib/client/store'
import { useMandateHealth } from '@/lib/client/use-health'
import { type LiveOrder, useMandateLive } from '@/lib/client/use-mandate-live'
import { cn } from '@/lib/cn'
import type { LiquidityMandate } from '@/lib/mandate/types'
import type { PolicyOverrides } from '@/lib/health/simulate'
import { coverageFor, type Proposal } from '@/lib/policy/plan'
import { formatTickPrice } from '@/lib/market/ticks'
import { explorerAddress, explorerTx, shortHex } from '@/lib/tempo/chain'
import { formatAmount } from '@/lib/units'

export function MandateDetailView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const hydrated = useHydrated()
  const mandates = useMandates()
  const mandate = mandates.find((m) => m.id === id) ?? null
  if (!hydrated) return <LoadingState label="Loading market" />
  if (!mandate)
    return (
      <Panel>
        <EmptyState
          title="This market isn’t saved in this browser"
          body="Korrin keeps each market’s plan in the browser that set it up. Open it there, or set up a new one."
          actions={
            <>
              <ButtonLink href="/app/mandates/new" variant="primary">
                Set up a market
              </ButtonLink>
              <ButtonLink href="/app/session">Watch a recorded session</ButtonLink>
            </>
          }
        />
      </Panel>
    )
  return <MandateDetail mandate={mandate} />
}

type Flow = { kind: 'place'; proposal: Proposal; minOrderAmount?: bigint } | { kind: 'cancel'; orderId: string } | { kind: 'withdraw'; token: 'base' | 'quote' } | null

function MandateDetail({ mandate }: { mandate: LiquidityMandate }) {
  const live = useMandateLive(mandate)
  const signer = useActiveSigner()
  const actions = useActions()
  const allOrders = useOrders()
  const router = useRouter()
  const search = useSearchParams()
  const [flow, setFlow] = useState<Flow>(null)
  const [inspect, setInspect] = useState<TimelineItem | null>(null)
  const [analystOpen, setAnalystOpen] = useState(false)
  const [whatIfSeed, setWhatIfSeed] = useState<{ overrides: PolicyOverrides; n: number } | null>(null)
  const d = mandate.base.decimals
  const paused = mandate.status === 'paused'
  const proposal = live.proposal
  const canAct = Boolean(proposal?.requiresApproval && !paused && live.signerMatches && mandate.status !== 'closed')

  // The builder hands over with ?review=1 so the first order opens straight into review,
  // frozen at the first usable proposal. Set during render so the flow opens in the same pass.
  const [autoReview, setAutoReview] = useState(() => search.get('review') === '1')
  if (autoReview && proposal && proposal.reasonCode !== 'balances_unreadable' && live.signerMatches) {
    setAutoReview(false)
    if (proposal.candidateOrder && canAct) setFlow({ kind: 'place', proposal, minOrderAmount: live.snapshot ? BigInt(live.snapshot.constants.minOrderAmount) : undefined })
  }
  const reviewParam = search.get('review')
  useEffect(() => {
    if (reviewParam === '1' && !autoReview) router.replace(`/app/mandates/${mandate.id}`)
  }, [reviewParam, autoReview, router, mandate.id])

  const mandateOrders = useMemo(() => allOrders.filter((o) => o.mandateId === mandate.id), [allOrders, mandate.id])
  const earliestBlock = useMemo(() => mandateOrders.reduce<string | null>((m, o) => (m === null || BigInt(o.placedBlock) < BigInt(m) ? o.placedBlock : m), null), [mandateOrders])
  const events = useEventsFor(
    mandateOrders.map((o) => o.orderId),
    earliestBlock,
  )
  const timeline = useMemo(
    () =>
      sortTimeline([
        ...actions.filter((a) => a.mandateId === mandate.id).map(actionToItem),
        ...(events.data?.events ?? []).map((e) => eventToItem(e, d, mandate.base.symbol)),
      ]),
    [actions, events.data, mandate.id, d, mandate.base.symbol],
  )
  const flipsByOrder = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events.data?.events ?? []) if (e.event === 'OrderFlipped') m.set(e.orderId, (m.get(e.orderId) ?? 0) + 1)
    return m
  }, [events.data])

  const flipFailedIds = useMemo(() => (events.data?.events ?? []).filter((e) => e.event === 'FlipFailed').map((e) => e.orderId), [events.data])
  const health = useMandateHealth(mandate, live, flipFailedIds)
  const reportSide = (side: 'bid' | 'ask') => {
    const m = health.report?.mandate
    const own = side === 'bid' ? health.report?.depth.ownBid.value : health.report?.depth.ownAsk.value
    const target = BigInt(side === 'bid' ? mandate.targetBidDepth : mandate.targetAskDepth)
    if (!m || own === null || own === undefined) return { target, coverage: null }
    return { target, coverage: coverageFor(target, BigInt(own)) }
  }

  const obsAge = live.book && live.now ? Math.max(0, Math.round((live.now - live.book.observedAt) / 1000)) : null
  const stale = obsAge !== null && obsAge > mandate.maxDataAgeSeconds
  const baseBal = live.balances?.tokens.find((t) => t.address.toLowerCase() === mandate.base.address.toLowerCase())
  const quoteBal = live.balances?.tokens.find((t) => t.address.toLowerCase() === mandate.quote.address.toLowerCase())

  const setStatus = (status: LiquidityMandate['status'], kind: 'pause' | 'resume') => {
    patchMandate(mandate.id, { status })
    recordAction({
      mandateId: mandate.id,
      kind,
      stage: 'recorded',
      summary: kind === 'pause' ? 'Paused new orders. Resting orders were left on the book.' : 'Resumed. Korrin can propose new orders again.',
    })
  }

  const review = () => {
    if (!proposal) return
    setFlow(proposal.cancelOrderId !== undefined ? { kind: 'cancel', orderId: proposal.cancelOrderId.toString() } : { kind: 'place', proposal, minOrderAmount: live.snapshot ? BigInt(live.snapshot.constants.minOrderAmount) : undefined })
  }

  const nextCard = (
    <NextOrderCard
      proposal={proposal}
      paused={paused}
      action={
        <div className="space-y-2">
          {(proposal?.requiresApproval || canAct) && (
            <Button variant="primary" size="lg" className="w-full" disabled={!canAct} onClick={review}>
              {proposal?.cancelOrderId !== undefined ? 'Review cancel' : 'Review order'}
            </Button>
          )}
          <Button variant="ghost" className="w-full" icon={<MessageSquareText className="size-4" />} disabled={!health.report} onClick={() => setAnalystOpen(true)}>
            Ask Korrin Analyst
          </Button>
        </div>
      }
      footnote={paused ? 'Pausing stops new orders. It doesn’t cancel resting ones. Cancel them below.' : !live.signerMatches && proposal?.requiresApproval ? 'Only the owner account can sign this.' : undefined}
    />
  )

  return (
    <>
      <Link href="/app/mandates" className="mb-5 inline-flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-ink">
        <ArrowLeft className="size-4" /> Your markets
      </Link>
      <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">
            <PairLabel base={mandate.base} quote={mandate.quote} size={30} className="gap-3" labelClassName="text-structural" />
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-muted">
            <MandateStatusPill status={mandate.status} />
            <span>{mandate.name}</span>
            <span>
              Target <span className="tabular text-ink-2">{formatTickPrice(mandate.targetTick)}</span>, ±{mandate.bandTicks / 10} bp
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={live.refresh} icon={<RefreshCw className="size-4" />} aria-label="Refresh chain reads" iconOnly />
          <ShareReport mandate={mandate} orders={mandateOrders} disabled={!live.signerMatches} />
          {paused ? (
            <Button variant="secondary" onClick={() => setStatus('active', 'resume')} icon={<Play className="size-4" />}>
              Resume
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStatus('paused', 'pause')} icon={<Pause className="size-4" />} disabled={mandate.status === 'closed'}>
              Pause new orders
            </Button>
          )}
        </div>
      </header>

      {!live.signerMatches && (
        <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-card)] bg-recessed px-4 py-3.5 text-[14px] text-ink-2">
          <Eye className="mt-0.5 size-4 shrink-0 text-muted" />
          {signer ? `You’re watching this market. The connected account ${shortHex(signer.address, 4, 4)} doesn’t own it, so only ${shortHex(mandate.owner, 4, 4)} can sign its orders.` : 'You’re watching this market. Connect the account that owns it to sign orders. Everything below stays live without it.'}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <CoverageBoard bid={reportSide('bid')} ask={reportSide('ask')} decimals={d} symbol={mandate.base.symbol} />
          <div className="xl:hidden">
            {nextCard}
          </div>
          <Panel className={cn('min-w-0 transition-[filter] duration-300', paused && '[&_.corridor-actionable]:grayscale')}>
            <PanelHeader
              title="Liquidity corridor"
              description={paused ? 'Paused. Korrin keeps reading the book but won’t propose new orders.' : 'The live book around your target. Solid bars are your orders, read back from the DEX. Hatched bars are everyone else.'}
              actions={<SourceBadge source="onchain" />}
            />
            <div className="px-3 md:px-5">{live.corridor ? <LiquidityCorridor model={{ ...live.corridor, coverage: null }} paused={paused} height={500} /> : live.snapshotError ? <ErrorState title="The book couldn’t be read" reason={live.snapshotError} /> : <LoadingState label="Reading the book" />}</div>
            <div className="hairline-t mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-line px-5 py-3.5 text-[13px] text-muted">
              <SignalDot state={live.snapshotError && !live.book ? 'offline' : stale ? 'stale' : live.book ? 'live' : 'idle'} label={live.book ? `Book at block #${Number(live.book.blockNumber).toLocaleString('en-US')}` : 'Waiting for the book'} />
              <span className={cn(stale && 'text-ink')}>
                Read {ageLabel(live.book?.observedAt ?? null, live.now)}, limit {mandate.maxDataAgeSeconds}s
              </span>
              <span>Depth read {ageLabel(live.snapshot?.observedAt ?? null, live.now)}</span>
              {live.ordersBlock && <span>Orders read at block #{Number(live.ordersBlock).toLocaleString('en-US')}</span>}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="hidden xl:block">
            {nextCard}
          </div>

          <section className="card">
            <header className="px-5 pt-5">
              <h2 className="title">Your funds</h2>
              <p className="label mt-0.5">What this market can use, and what’s already on the book</p>
            </header>
            <div className="px-5 pt-4 pb-5">
              <CapitalAllocation inventory={proposal?.inventory ?? null} decimals={d} baseSymbol={mandate.base.symbol} quoteSymbol={mandate.quote.symbol} />
            </div>
            <div className="hairline-t border-line px-5 py-4">
              <div className="label">In your DEX balance</div>
              <ul className="mt-2 space-y-2">
                {([['quote', mandate.quote.symbol, quoteBal], ['base', mandate.base.symbol, baseBal]] as const).map(([token, symbol, bal]) => (
                  <li key={token} className="flex items-center justify-between gap-3">
                    <span className="text-[14px] text-ink-2">{symbol}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular text-[14px] text-ink">{bal ? formatAmount(BigInt(bal.dex), d) : '—'}</span>
                      <Button size="sm" variant="secondary" icon={<Undo2 className="size-3.5" />} disabled={!live.signerMatches || !bal || BigInt(bal.dex) === 0n} onClick={() => setFlow({ kind: 'withdraw', token })} aria-label={`Withdraw ${symbol}`}>
                        Withdraw
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[13px] leading-snug text-muted">Cancelled orders and fills land here. Withdraw moves them back to your wallet.</p>
            </div>
          </section>

        </div>
      </div>

      <section className="mt-10" aria-labelledby="market-health">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="market-health" className="heading text-structural">
              Market health
            </h2>
            <p className="label mt-1">One report per block, built from the same reads as the corridor above. The paid API and the analyst serve this exact report.</p>
          </div>
          <Button variant="secondary" icon={<MessageSquareText className="size-4" />} disabled={!health.report} onClick={() => setAnalystOpen(true)}>
            Ask Korrin Analyst
          </Button>
        </div>
        {health.report ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <ReportPanel report={health.report} freshness={health.freshness} />
            <ExceptionsPanel exceptions={health.exceptions} incidents={health.incidents} />
          </div>
        ) : (
          <Panel>
            <LoadingState label="Building the first health report" />
          </Panel>
        )}
        <div className="mt-5">
          <WhatIfPanel key={whatIfSeed?.n ?? 0} mandate={mandate} snapshot={live.planningSnapshot} seed={whatIfSeed?.overrides} />
        </div>
      </section>

      <Panel className="mt-5">
        <PanelHeader
          title="Orders"
          description="Every order this market placed, read back from the DEX. A flip keeps the same order ID."
          actions={
            live.orders.length > 0 && (
              <Button size="sm" variant="quiet-danger" icon={<Ban className="size-3.5" />} disabled={!live.signerMatches} onClick={() => live.orders[0] && setFlow({ kind: 'cancel', orderId: live.orders[0].orderId })}>
                Cancel {live.orders.length > 1 ? 'first live order' : 'live order'}
              </Button>
            )
          }
        />
        <OrdersTable orders={live.orders} closed={mandateOrders.filter((o) => o.closedAt)} flips={flipsByOrder} mandate={mandate} canCancel={live.signerMatches} onCancel={(orderId) => setFlow({ kind: 'cancel', orderId })} />
      </Panel>

      <Panel className="mt-5">
        <PanelHeader title="History" description="What you signed in this browser, merged with DEX events read from Tempo." actions={events.loading ? <span className="label">Reading events…</span> : undefined} />
        <div className="hairline-t border-line">
          <Timeline items={timeline} onSelect={setInspect} emptyLabel="Nothing yet. Review the next order to place your first one." />
        </div>
      </Panel>

      <details className="card group mt-5">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
          Technical details
          <ChevronDown className="size-4 text-muted transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <dl className="hairline-t border-line px-5 py-3">
          <KeyValue label="Owner" mono>
            <a className="hover:text-accent" href={explorerAddress(mandate.owner)} target="_blank" rel="noreferrer">
              {shortHex(mandate.owner, 6, 4)}
            </a>
          </KeyValue>
          <KeyValue label="Plan ID" mono>
            <Tooltip content={`keccak256 of the plan’s limits: ${mandate.policyDigest}`}>
              <span className="cursor-default">{shortHex(mandate.policyDigest, 6, 6)}</span>
            </Tooltip>
          </KeyValue>
          <KeyValue label="Version" mono>
            v{mandate.version}
          </KeyValue>
          <KeyValue label="Quotes at" mono>
            {formatTickPrice(mandate.targetTick - mandate.quoteOffsetTicks)} / {formatTickPrice(mandate.targetTick + mandate.quoteOffsetTicks)}
          </KeyValue>
          <KeyValue label="Order cap" mono>
            {formatAmount(BigInt(mandate.maxOrderAmount), d, 0)} {mandate.base.symbol}
          </KeyValue>
          <KeyValue label="Freshness limit" mono>
            {mandate.maxDataAgeSeconds}s
          </KeyValue>
          <KeyValue label="Orders per hour" mono>
            {mandate.maxActionsPerHour}
          </KeyValue>
          <KeyValue label="Max share on one side" mono>
            {mandate.maxInventoryShareBps / 100}%
          </KeyValue>
        </dl>
      </details>

      <AnalystDrawer
        open={analystOpen}
        onOpenChange={setAnalystOpen}
        report={health.report}
        previous={health.previous}
        exceptions={health.exceptions}
        incidents={health.incidents}
        mandate={mandate}
        planning={live.planningSnapshot}
        onOpenReview={() => {
          setAnalystOpen(false)
          if (canAct) review()
        }}
        onApplyDraft={(overrides) => {
          setAnalystOpen(false)
          setWhatIfSeed((prev) => ({ overrides, n: (prev?.n ?? 0) + 1 }))
          requestAnimationFrame(() => document.getElementById('whatif')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
        }}
      />
      <TransactionDrawer item={inspect} onOpenChange={(o) => !o && setInspect(null)} decimals={d} symbol={mandate.base.symbol} />

      {flow?.kind === 'place' && flow.proposal.candidateOrder && (
        <ExecutionFlow
          open
          onOpenChange={(o) => !o && setFlow(null)}
          title={`Place flip ${flow.proposal.candidateOrder.side === 'buy' ? 'bid' : 'ask'}`}
          description={flow.proposal.cause}
          rows={placeRows(mandate, flow.proposal.candidateOrder, flow.minOrderAmount)}
          confirmLabel="Sign and place"
          notice="This order is frozen at the book read it came from. Korrin marks it on the book only after reading it back from the DEX."
          run={(onStage) => {
            const order = flow.proposal.candidateOrder
            if (!order) throw new Error('No order to place')
            return placeMandateOrder(mandate, order, { reasonCode: flow.proposal.reasonCode, expiresAtMs: flow.proposal.expiresAtMs }, onStage).then(() => {
              if (mandate.status === 'armed' || mandate.status === 'draft') patchMandate(mandate.id, { status: 'active' })
              live.refresh()
            })
          }}
        />
      )}
      {flow?.kind === 'cancel' && (
        <ExecutionFlow
          open
          destructive
          onOpenChange={(o) => !o && setFlow(null)}
          title={`Cancel order ${flow.orderId}`}
          description="Takes this order off the book. Its funds go to your DEX balance, not your wallet. Withdraw them separately."
          rows={[
            { label: 'Call', value: 'StablecoinDEX.cancel', mono: true },
            { label: 'Order ID', value: flow.orderId, mono: true },
            { label: 'Confirmed when', value: 'Reading the order back returns OrderDoesNotExist' },
          ]}
          confirmLabel="Sign and cancel"
          run={(onStage) => cancelMandateOrder(mandate.id, flow.orderId, onStage).then(() => live.refresh())}
        />
      )}
      {flow?.kind === 'withdraw' && (
        <ExecutionFlow
          open
          onOpenChange={(o) => !o && setFlow(null)}
          title={`Withdraw ${flow.token === 'quote' ? mandate.quote.symbol : mandate.base.symbol}`}
          description="Moves this token’s full DEX balance back to your wallet."
          rows={[
            { label: 'Call', value: 'StablecoinDEX.withdraw', mono: true },
            { label: 'Amount', value: `${formatAmount(BigInt((flow.token === 'quote' ? quoteBal : baseBal)?.dex ?? '0'), d)} ${flow.token === 'quote' ? mandate.quote.symbol : mandate.base.symbol}`, mono: true },
          ]}
          confirmLabel="Sign and withdraw"
          run={(onStage) => {
            const bal = flow.token === 'quote' ? quoteBal : baseBal
            const token = flow.token === 'quote' ? mandate.quote : mandate.base
            return withdrawDexBalance(token.address, token.symbol, BigInt(bal?.dex ?? '0'), onStage).then(() => live.refresh())
          }}
        />
      )}
    </>
  )
}

function OrdersTable({
  orders,
  closed,
  flips,
  mandate,
  canCancel,
  onCancel,
}: {
  orders: LiveOrder[]
  closed: { orderId: string; side: 'buy' | 'sell'; tick: number; amount: string; placedTx: `0x${string}`; closeReason?: string }[]
  flips: Map<string, number>
  mandate: LiquidityMandate
  canCancel: boolean
  onCancel: (orderId: string) => void
}) {
  const d = mandate.base.decimals
  if (orders.length === 0 && closed.length === 0) return <EmptyState title="No orders yet" body="When you approve your first order, its DEX order ID shows up here with its live state." />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="hairline-b border-line text-[12.5px] text-muted">
            {['Order ID', 'Side now', 'Price', 'Flips to', 'Amount left', 'Status', 'Placed in', ''].map((h, i) => (
              <th key={h || i} className={cn('px-4 py-2.5 font-normal whitespace-nowrap first:pl-5 last:pr-5', i >= 2 && i <= 4 ? 'text-right' : 'text-left')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const r = o.readback
            const live = r?.status === 'live' ? r : null
            const isBid = live ? live.isBid : o.side === 'buy'
            const flipCount = flips.get(o.orderId) ?? 0
            return (
              <tr key={o.orderId} className="hairline-b border-line-faint">
                <td className="tabular px-4 py-3 pl-5 text-ink">#{o.orderId}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex items-center gap-1.5', isBid ? 'text-bid' : 'text-ask')}>
                    <span className={cn('size-1.5 rounded-full', isBid ? 'bg-bid' : 'bg-ask')} />
                    {isBid ? 'Bid' : 'Ask'}
                  </span>
                </td>
                <td className="tabular px-4 py-3 text-right text-ink">{formatTickPrice(live?.tick ?? o.tick, 5)}</td>
                <td className="tabular px-4 py-3 text-right text-muted">{formatTickPrice(live?.flipTick ?? o.flipTick, 5)}</td>
                <td className="tabular px-4 py-3 text-right text-ink">
                  {formatAmount(BigInt(live?.remaining ?? o.amount), d)} <span className="font-sans text-[13px] text-muted">{mandate.base.symbol}</span>
                </td>
                <td className="px-4 py-3">
                  {live ? (
                    <span className="flex flex-wrap gap-1.5">
                      <StatusPill tone="positive">On the book</StatusPill>
                      {flipCount > 0 && <StatusPill tone="info">Flipped ×{flipCount}</StatusPill>}
                    </span>
                  ) : r?.status === 'unknown' ? (
                    <Tooltip content={r.error}>
                      <span>
                        <StatusPill tone="unknown">Not confirmed</StatusPill>
                      </span>
                    </Tooltip>
                  ) : (
                    <StatusPill tone="neutral">Checking the book</StatusPill>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a href={explorerTx(o.placedTx)} target="_blank" rel="noreferrer" className="tabular inline-flex items-center gap-1 text-[13.5px] text-accent hover:underline">
                    {shortHex(o.placedTx, 4, 4)} <ExternalLink className="size-3" />
                  </a>
                </td>
                <td className="px-4 py-3 pr-5 text-right">
                  <Button size="sm" variant="quiet-danger" disabled={!canCancel || !live} onClick={() => onCancel(o.orderId)}>
                    Cancel
                  </Button>
                </td>
              </tr>
            )
          })}
          {closed.map((o) => (
            <tr key={o.orderId} className="hairline-b border-line-faint text-muted last:border-b-0">
              <td className="tabular px-4 py-3 pl-5">#{o.orderId}</td>
              <td className="px-4 py-3">{o.side === 'buy' ? 'Bid' : 'Ask'}</td>
              <td className="tabular px-4 py-3 text-right">{formatTickPrice(o.tick, 5)}</td>
              <td className="px-4 py-3 text-right">—</td>
              <td className="tabular px-4 py-3 text-right">{formatAmount(BigInt(o.amount), d)}</td>
              <td className="px-4 py-3">
                <StatusPill tone="neutral">{o.closeReason === 'cancelled' ? 'Cancelled, confirmed' : 'No longer on the book'}</StatusPill>
              </td>
              <td className="px-4 py-3">
                <a href={explorerTx(o.placedTx)} target="_blank" rel="noreferrer" className="tabular inline-flex items-center gap-1 text-[13.5px] hover:text-accent">
                  {shortHex(o.placedTx, 4, 4)} <ExternalLink className="size-3" />
                </a>
              </td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

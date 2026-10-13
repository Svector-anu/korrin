'use client'

import { ArrowRight, ArrowUpRight, CircleCheck, Plus } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { LiquidityCorridor } from '@/components/corridor/liquidity-corridor'
import { actionToItem, Timeline } from '@/components/execution/timeline'
import { CoverageBoard } from '@/components/mandate/coverage-board'
import { NextOrderCard } from '@/components/mandate/decision'
import { MandateStatusPill } from '@/components/mandate/status'
import { SessionPlayer } from '@/components/session/session-player'
import { AttentionList } from '@/components/shell/inbox'
import { ButtonLink } from '@/components/ui/button'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { SourceBadge } from '@/components/ui/status'
import { PairLabel, TokenIcon } from '@/components/ui/token'
import { usdSymbol, useAttention } from '@/lib/client/attention'
import { useActiveSigner } from '@/lib/client/signer'
import { useActions, useHydrated, useMandates } from '@/lib/client/store'
import { useMandateHealth } from '@/lib/client/use-health'
import { useMandateLive } from '@/lib/client/use-mandate-live'
import { cn } from '@/lib/cn'
import type { LiquidityMandate } from '@/lib/mandate/types'
import { formatTickPrice } from '@/lib/market/ticks'
import { coverageFor } from '@/lib/policy/plan'
import { formatAmount } from '@/lib/units'

export function OverviewView() {
  const hydrated = useHydrated()
  const mandates = useMandates()
  const { items } = useAttention()

  const primary = useMemo(() => {
    const flagged = items.map((i) => mandates.find((m) => i.href.endsWith(m.id))).find(Boolean)
    if (flagged) return flagged
    const byRecent = [...mandates].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    return byRecent.find((m) => m.status === 'active' || m.status === 'armed') ?? byRecent[0] ?? null
  }, [items, mandates])

  if (!hydrated) return <LoadingState label="Loading your workspace" />
  if (!primary) return <FirstRun />
  return <MarketHome mandate={primary} others={mandates.filter((m) => m.id !== primary.id)} />
}

const FIRST_STEPS = [
  { title: 'Choose an order book', body: 'Pairs come straight from Tempo’s stablecoin DEX.' },
  { title: 'Set your range and sizes', body: 'A target price, how far either side you’ll quote, and how much.' },
  { title: 'Approve each order', body: 'You sign every order. Korrin counts it once it reads it back from the book.' },
]

function FirstRun() {
  return (
    <section className="grid min-h-[calc(100dvh-190px)] items-center gap-10 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:gap-12">
      <div className="max-w-[560px]">
        <h1 className="display max-w-[14ch] text-structural">Put your first market on the book.</h1>
        <p className="prose-body mt-5 text-[17px]">Pick a stablecoin pair, choose the prices and amounts you’ll quote, and approve each order. Korrin shows you what’s really on Tempo’s order book, so you know when your target is met.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/app/mandates/new" variant="primary" size="lg" icon={<Plus className="size-4" />}>
            Set up a market
          </ButtonLink>
          <ButtonLink href="/app/session" size="lg">
            Watch a recorded session
          </ButtonLink>
        </div>
        <ol className="mt-10 space-y-5">
          {FIRST_STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-recessed text-[14px] text-ink-2">{i + 1}</span>
              <span>
                <span className="block text-[15.5px] font-medium text-ink">{s.title}</span>
                <span className="mt-0.5 block text-[14px] leading-snug text-muted">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="min-w-0 rounded-[var(--radius-sheet)] bg-recessed p-2 md:p-3">
        <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)] md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[15px] font-medium text-ink">A real session on the AlphaUSD book</span>
            <ButtonLink href="/app/session" size="sm" variant="ghost" trailingIcon={<ArrowUpRight className="size-3.5" />}>
              Step through it
            </ButtonLink>
          </div>
          <SessionPlayer compact autoPlay />
        </div>
      </div>
    </section>
  )
}

function MarketHome({ mandate, others }: { mandate: LiquidityMandate; others: LiquidityMandate[] }) {
  const live = useMandateLive(mandate)
  const { items, balances } = useAttention()
  const signer = useActiveSigner()
  const actions = useActions()
  const proposal = live.proposal
  const paused = mandate.status === 'paused'
  const d = mandate.base.decimals
  const canSign = Boolean(proposal?.requiresApproval && !paused && live.signerMatches && mandate.status !== 'closed')
  const href = `/app/mandates/${mandate.id}`
  const health = useMandateHealth(mandate, live)
  const side = (s: 'bid' | 'ask') => {
    const own = s === 'bid' ? health.report?.depth.ownBid.value : health.report?.depth.ownAsk.value
    const target = BigInt(s === 'bid' ? mandate.targetBidDepth : mandate.targetAskDepth)
    return { target, coverage: own === null || own === undefined ? null : coverageFor(target, BigInt(own)) }
  }

  return (
    <>
      <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[15px] text-muted">Here’s your market</p>
          <h1 className="page-title mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
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
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/app/mandates/new" icon={<Plus className="size-4" />}>
            Set up another
          </ButtonLink>
          <ButtonLink href={href} variant="primary" trailingIcon={<ArrowRight className="size-4" />}>
            Open market
          </ButtonLink>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <CoverageBoard bid={side('bid')} ask={side('ask')} decimals={d} symbol={mandate.base.symbol} />
          <div className="xl:hidden">
            <NextOrderCard
              proposal={proposal}
              paused={paused}
              action={
                <ButtonLink href={canSign && proposal?.candidateOrder ? `${href}?review=1` : href} variant={canSign ? 'primary' : 'secondary'} className="w-full">
                  {canSign ? 'Review order' : 'Open market'}
                </ButtonLink>
              }
              footnote={!live.signerMatches ? (signer ? 'The connected account doesn’t own this market, so it can watch but not sign.' : 'Connect the account that owns this market to sign orders.') : undefined}
            />
          </div>
          <Panel className="min-w-0">
            <PanelHeader title="Your range on the live book" description="Solid bars are your orders, read back from the DEX. Hatched bars are everyone else." actions={<SourceBadge source="onchain" />} />
            <div className="px-3 pb-4 md:px-5">
              {live.corridor ? (
                <LiquidityCorridor model={{ ...live.corridor, coverage: null }} paused={paused} height={300} />
              ) : live.snapshotError ? (
                <ErrorState title="The book couldn’t be read" reason={live.snapshotError} />
              ) : (
                <LoadingState label="Reading the book" />
              )}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="hidden xl:block">
            <NextOrderCard
              proposal={proposal}
              paused={paused}
              action={
                <ButtonLink href={canSign && proposal?.candidateOrder ? `${href}?review=1` : href} variant={canSign ? 'primary' : 'secondary'} className="w-full">
                  {canSign ? 'Review order' : 'Open market'}
                </ButtonLink>
              }
              footnote={!live.signerMatches ? (signer ? 'The connected account doesn’t own this market, so it can watch but not sign.' : 'Connect the account that owns this market to sign orders.') : undefined}
            />
          </div>
          <section className="card">
            <header className="flex items-baseline justify-between px-5 pt-5 pb-2">
              <h2 className="title">Needs you</h2>
              <span className="text-[13px] text-muted">{items.length ? `${items.length} open` : 'All clear'}</span>
            </header>
            <div className="px-2.5 pb-3">
              {items.length ? (
                <AttentionList items={items.slice(0, 4)} />
              ) : (
                <p className="flex gap-2.5 px-2.5 py-2 text-[14px] leading-snug text-ink-2">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-positive" />
                  Every order Korrin tracks matches what Tempo reports.
                </p>
              )}
            </div>
          </section>
          {signer && (
            <section className="card px-5 py-5">
              <h2 className="title">Wallet</h2>
              <p className="label mt-0.5">Wallet balance, plus anything waiting in the DEX</p>
              <ul className="mt-4 space-y-3">
                {(balances.data?.tokens ?? []).map((t) => (
                  <li key={t.address} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="flex items-center gap-2.5 text-ink-2">
                      <TokenIcon address={t.address} size={22} />
                      {usdSymbol(t.address)}
                    </span>
                    <span className="tabular text-right text-ink">
                      {formatAmount(BigInt(t.wallet), 6)}
                      {BigInt(t.dex) > 0n && <span className="block text-[12.5px] text-muted">+{formatAmount(BigInt(t.dex), 6)} in DEX</span>}
                    </span>
                  </li>
                ))}
                {!balances.data && <li className="label">Reading balances…</li>}
              </ul>
            </section>
          )}
        </div>
      </div>

      {others.length > 0 && (
        <Panel className="mt-5">
          <PanelHeader title="Your other markets" actions={<ButtonLink href="/app/mandates" size="sm" variant="ghost" trailingIcon={<ArrowUpRight className="size-3.5" />}>All markets</ButtonLink>} />
          <ul className="hairline-t divide-y divide-line-faint border-line">
            {others.map((m) => (
              <li key={m.id}>
                <Link href={`/app/mandates/${m.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-hover">
                  <span className="flex items-center gap-3">
                    <PairLabel base={m.base} quote={m.quote} size={22} />
                    <span className="text-[14px] text-muted">{m.name}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="tabular text-[14px] text-ink-2">
                      {formatTickPrice(m.targetTick)} ±{m.bandTicks / 10} bp
                    </span>
                    <MandateStatusPill status={m.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {actions.length > 0 && (
        <Panel className={cn('mt-5')}>
          <PanelHeader title="Recent activity" actions={<ButtonLink href="/app/activity" size="sm" variant="ghost" trailingIcon={<ArrowUpRight className="size-3.5" />}>All activity</ButtonLink>} />
          <div className="hairline-t border-line">
            <Timeline items={actions.slice(0, 5).map(actionToItem)} />
          </div>
        </Panel>
      )}
    </>
  )
}

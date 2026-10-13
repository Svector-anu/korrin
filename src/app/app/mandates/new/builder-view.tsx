'use client'

import { Check, ChevronDown, ChevronLeft, Info, KeyRound, Wallet, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { Address } from 'viem'
import { LiquidityCorridor } from '@/components/corridor/liquidity-corridor'
import { DecisionStrip } from '@/components/mandate/decision'
import { CapitalAllocation } from '@/components/mandate/health'
import { placeRows } from '@/components/mandate/order-rows'
import { Button } from '@/components/ui/button'
import { AmountInput, RangeField, TextInput } from '@/components/ui/fields'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { SourceBadge, StatusPill } from '@/components/ui/status'
import { PairLabel } from '@/components/ui/token'
import { createTestnetSigner } from '@/lib/client/execute'
import { type MarketDto, useMarkets } from '@/lib/client/data'
import { useActiveSigner } from '@/lib/client/signer'
import { newId, recordAction, upsertMandate } from '@/lib/client/store'
import { useMandateLive } from '@/lib/client/use-mandate-live'
import { cn } from '@/lib/cn'
import { defaultDraft, draftToMandate, type MandateDraft, validateDraft } from '@/lib/mandate/draft'
import { bookShape, midTick, spreadBps } from '@/lib/market/book'
import { formatTickPrice, hasBestAsk, hasBestBid } from '@/lib/market/ticks'
import { plan } from '@/lib/policy/plan'
import { CHAIN_ID } from '@/lib/tempo/chain'
import { formatAmount } from '@/lib/units'

const STEPS = ['Order book', 'Range and sizes', 'Review order'] as const
const ZERO: Address = '0x0000000000000000000000000000000000000000'

export function BuilderView() {
  const params = useSearchParams()
  const router = useRouter()
  const markets = useMarkets()
  const signer = useActiveSigner()
  const [step, setStep] = useState(0)
  const [baseAddr, setBaseAddr] = useState<string | null>(params.get('base'))
  const [draft, setDraft] = useState<MandateDraft | null>(null)

  const faucet = useMemo(() => (markets.data?.markets ?? []).filter((m) => m.canonical), [markets.data])
  const market = markets.data?.markets.find((m) => m.base.address.toLowerCase() === baseAddr?.toLowerCase()) ?? null

  const chooseMarket = (m: MarketDto) => {
    setBaseAddr(m.base.address)
    setDraft(defaultDraft(`${m.base.symbol}/${m.quote.symbol}`, midTick(m.bestBidTick, m.bestAskTick)))
  }
  const activeDraft = draft ?? (market ? defaultDraft(`${market.base.symbol}/${market.quote.symbol}`, midTick(market.bestBidTick, market.bestAskTick)) : null)

  return (
    <>
      <header className="mb-7">
        <h1 className="page-title">Set up a market</h1>
        <p className="prose-body mt-2 max-w-[62ch] text-muted">Choose an order book, set your price range and sizes, then review the first order. Nothing is signed until you approve it.</p>
      </header>
      <ol className="mb-7 flex flex-wrap items-center gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              disabled={i > step && !(i === 1 && market) && !(i === 2 && market && activeDraft)}
              onClick={() => setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'inline-flex h-10 items-center gap-2.5 rounded-full pr-4 pl-1.5 text-[15px] transition-colors duration-150 disabled:cursor-not-allowed',
                i === step ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-muted hover:text-ink',
              )}
            >
              <span className={cn('tabular flex size-7 items-center justify-center rounded-full text-[13px]', i < step ? 'bg-positive text-white' : i === step ? 'bg-primary text-primary-ink' : 'bg-recessed text-muted')}>
                {i < step ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-8 bg-line-strong" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <MarketStep
          markets={faucet}
          loading={!markets.data}
          error={markets.error}
          selected={market}
          onSelect={chooseMarket}
          onNext={() => {
            if (market && !draft) setDraft(defaultDraft(`${market.base.symbol}/${market.quote.symbol}`, midTick(market.bestBidTick, market.bestAskTick)))
            setStep(1)
          }}
        />
      )}
      {step > 0 && market && activeDraft && (
        <ShapeAndReview
          step={step}
          market={market}
          draft={activeDraft}
          setDraft={setDraft}
          owner={signer?.address ?? null}
          onBack={() => setStep(step - 1)}
          onNext={() => setStep(2)}
          onCreate={(id) => router.push(`/app/mandates/${id}?review=1`)}
        />
      )}
    </>
  )
}

function MarketStep({
  markets,
  loading,
  error,
  selected,
  onSelect,
  onNext,
}: {
  markets: MarketDto[]
  loading: boolean
  error: string | null
  selected: MarketDto | null
  onSelect: (m: MarketDto) => void
  onNext: () => void
}) {
  if (error && loading) return <ErrorState title="The books couldn’t be read" reason={error} />
  if (loading) return <LoadingState label="Reading the DEX order books" />
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div role="radiogroup" aria-label="Order book" className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {markets.length === 0 && <EmptyState title="No supported books found" body="The DEX returned no testnet USD books. Try again shortly." />}
          {markets.map((m) => {
            const active = selected?.bookKey === m.bookKey
            const spread = spreadBps(m.bestBidTick, m.bestAskTick)
            const shape = bookShape(m.bestBidTick, m.bestAskTick)
            return (
              <button
                key={m.bookKey}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelect(m)}
                className={cn(
                  'flex flex-col gap-5 rounded-[var(--radius-card)] bg-surface p-5 text-left transition-[box-shadow,background-color] duration-150',
                  active ? 'shadow-[0_0_0_2px_var(--ink-structural)]' : 'shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-float)]',
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <PairLabel base={m.base} quote={m.quote} size={30} className="gap-2.5 text-[17px]" />
                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border', active ? 'border-structural bg-structural text-ink-inverse' : 'border-line-strong')} aria-hidden>
                    {active && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </span>
                <span className="grid grid-cols-3 gap-3">
                  <span>
                    <span className="label block">Best bid</span>
                    <span className="figure mt-1.5 block text-[20px] text-bid">{hasBestBid(m.bestBidTick) ? formatTickPrice(m.bestBidTick) : '—'}</span>
                  </span>
                  <span>
                    <span className="label block">Best ask</span>
                    <span className="figure mt-1.5 block text-[20px] text-ask">{hasBestAsk(m.bestAskTick) ? formatTickPrice(m.bestAskTick) : '—'}</span>
                  </span>
                  <span>
                    <span className="label block">Spread</span>
                    <span className="figure mt-1.5 block text-[20px] text-ink">{spread === null ? '—' : `${spread.toFixed(1)}`}</span>
                  </span>
                </span>
                <StatusPill tone={shape === 'two-sided' ? 'positive' : 'info'} className="self-start">
                  {shape === 'two-sided' ? 'Bids and asks resting' : shape === 'locked' ? 'Best bid equals best ask' : shape === 'crossed' ? 'Bid above ask' : shape}
                </StatusPill>
              </button>
            )
          })}
        </div>
      </div>
      <section className="card flex flex-col self-start">
        <header className="px-5 pt-5">
          <h2 className="title">Ready to quote?</h2>
          <p className="label mt-0.5">Checked on chain for the book you pick</p>
        </header>
        <div className="flex-1 px-5 pt-4 pb-5">
          {selected ? (
            <ul className="space-y-3 text-[14px]">
              {[
                ['The book exists on Tempo’s DEX', true],
                [`${selected.base.symbol} isn’t paused`, !selected.base.paused],
                [`${selected.quote.symbol} isn’t paused`, !selected.quote.paused],
                [`${selected.quote.symbol} is ${selected.base.symbol}’s quote token`, selected.base.quoteToken?.toLowerCase() === selected.quote.address.toLowerCase()],
                [`Both tokens use ${selected.base.decimals} decimals`, selected.base.decimals === selected.quote.decimals],
                ['You’re on Tempo Moderato (42431)', true],
              ].map(([label, ok]) => (
                <li key={String(label)} className="flex items-start gap-2.5">
                  <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full', ok ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative')}>
                    {ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                  </span>
                  <span className={ok ? 'text-ink' : 'text-negative'}>{label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">Pick an order book to run the checks.</p>
          )}
        </div>
        <div className="hairline-t border-line px-5 py-4">
          <Button variant="primary" size="lg" className="w-full" disabled={!selected} onClick={onNext}>
            Continue
          </Button>
        </div>
      </section>
    </div>
  )
}

function ShapeAndReview({
  step,
  market,
  draft,
  setDraft,
  owner,
  onBack,
  onNext,
  onCreate,
}: {
  step: number
  market: MarketDto
  draft: MandateDraft
  setDraft: (d: MandateDraft) => void
  owner: Address | null
  onBack: () => void
  onNext: () => void
  onCreate: (id: string) => void
}) {
  const [draftId] = useState(() => newId())
  const [createdAt] = useState(() => new Date().toISOString())
  const set = <K extends keyof MandateDraft>(k: K, v: MandateDraft[K]) => setDraft({ ...draft, [k]: v })
  const decimals = market.base.decimals

  const mandate = useMemo(() => {
    const v = validateDraft(draft, { decimals, minOrderAmount: null, baseSymbol: market.base.symbol, quoteSymbol: market.quote.symbol })
    if (v.targetTick === null) return null
    return draftToMandate(draft, {
      id: draftId,
      owner: owner ?? ZERO,
      chainId: CHAIN_ID,
      base: { address: market.base.address, symbol: market.base.symbol, decimals },
      quote: { address: market.quote.address, symbol: market.quote.symbol, decimals: market.quote.decimals },
      bookKey: market.bookKey,
      targetTick: v.targetTick,
      status: 'armed',
      createdAt,
    })
  }, [draft, draftId, owner, market, decimals, createdAt])

  const live = useMandateLive(mandate)
  const minOrder = live.snapshot ? BigInt(live.snapshot.constants.minOrderAmount) : null
  const validation = validateDraft(draft, { decimals, minOrderAmount: minOrder, baseSymbol: market.base.symbol, quoteSymbol: market.quote.symbol })

  // Without a signer there are no balances, so the preview runs on a clearly labelled assumption.
  const simulated = !owner
  const proposal = useMemo(() => {
    if (!mandate || !live.planningSnapshot) return null
    if (!simulated) return live.proposal
    const alloc = (v: string) => BigInt(v)
    return plan(mandate, {
      ...live.planningSnapshot,
      balances: {
        base: { wallet: alloc(mandate.maxBaseAllocation) + alloc(mandate.reserveBase), dex: 0n },
        quote: { wallet: alloc(mandate.maxQuoteAllocation) + alloc(mandate.reserveQuote), dex: 0n },
      },
    })
  }, [mandate, live.planningSnapshot, live.proposal, simulated])

  const corridor = useMemo(() => {
    if (!live.corridor) return null
    const c = proposal?.candidateOrder
    return { ...live.corridor, proposal: c ? { side: c.side, tick: c.tick, flipTick: c.flipTick, amount: c.amount } : null }
  }, [live.corridor, proposal])

  const create = () => {
    if (!mandate || !owner || !validation.valid) return
    upsertMandate({ ...mandate, owner })
    recordAction({ mandateId: mandate.id, kind: 'create', stage: 'recorded', summary: `Set up ${mandate.name} (plan ID ${mandate.policyDigest.slice(0, 10)}…)` })
    onCreate(mandate.id)
  }

  const err = validation.errors
  const order = proposal?.candidateOrder
  const corridorPanel = (height: number) => (
    <Panel className="min-w-0">
      <PanelHeader
        title="Your range on the live book"
        description="Bars are real DEX levels. The dashed outline is the first order Korrin would propose."
        actions={simulated ? <SourceBadge source="simulated" /> : <SourceBadge source="onchain" />}
      />
      <div className="px-3 pb-3 md:px-5">{corridor ? <LiquidityCorridor model={corridor} height={height} /> : <LoadingState label="Reading levels around your range" />}</div>
    </Panel>
  )
  const simulatedNote = simulated && (
    <p className="flex items-start gap-2 px-1 text-[13.5px] leading-snug text-muted">
      <Info className="mt-0.5 size-4 shrink-0" />
      No signer is connected, so this preview assumes a wallet holding exactly your allocations plus reserves. Connect one to plan against real balances.
    </p>
  )

  if (step === 1)
    return (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {corridorPanel(420)}
          <DecisionStrip proposal={proposal} />
          {simulatedNote}
        </div>
        <section className="card min-w-0 self-start">
          <header className="px-5 pt-5">
            <h2 className="title">Range and sizes</h2>
            <p className="label mt-0.5">Every change re-plans against the live book. Nothing touches the chain.</p>
          </header>
          <div className="space-y-6 px-5 pt-5 pb-5">
            <TextInput label="Name" value={draft.name} onChange={(v) => set('name', v)} />
            <Section title="Price range">
              <AmountInput
                label="Target price"
                value={draft.targetPrice}
                onChange={(v) => set('targetPrice', v)}
                unit={market.quote.symbol}
                error={err.targetPrice}
                hint={
                  midTick(market.bestBidTick, market.bestAskTick) !== null ? (
                    <button type="button" className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink" onClick={() => set('targetPrice', formatTickPrice(Math.round((midTick(market.bestBidTick, market.bestAskTick) ?? 0) / 10) * 10))}>
                      Use the current mid, {formatTickPrice(Math.round((midTick(market.bestBidTick, market.bestAskTick) ?? 0) / 10) * 10)}
                    </button>
                  ) : undefined
                }
              />
              <RangeField label="How far either side" min={1} max={50} step={1} value={draft.bandBps} onChange={(v) => setDraft({ ...draft, bandBps: v, offsetBps: Math.min(draft.offsetBps, v) })} format={(v) => `±${v} bp`} hint="Only orders inside this range count toward your target." />
              <RangeField label="Quote distance from target" min={1} max={Math.max(1, draft.bandBps)} step={1} value={draft.offsetBps} onChange={(v) => set('offsetBps', v)} format={(v) => `${v} bp`} hint="Bids rest this far below target. When one fills, it flips to an ask the same distance above." />
              {err.offsetBps && <p className="text-[13px] text-negative">{err.offsetBps}</p>}
            </Section>
            <Section title="Sizes">
              <div className="grid grid-cols-2 gap-3">
                <AmountInput label="Bid target" value={draft.targetBidDepth} onChange={(v) => set('targetBidDepth', v)} unit={market.base.symbol} error={err.targetBidDepth} />
                <AmountInput label="Ask target" value={draft.targetAskDepth} onChange={(v) => set('targetAskDepth', v)} unit={market.base.symbol} error={err.targetAskDepth} />
              </div>
              <AmountInput label="Largest single order" value={draft.maxOrderAmount} onChange={(v) => set('maxOrderAmount', v)} unit={market.base.symbol} error={err.maxOrderAmount} hint={minOrder ? `The DEX minimum is ${formatAmount(minOrder, decimals, 0)} ${market.base.symbol}.` : undefined} />
            </Section>
            <Section title="Funds it can use">
              <div className="grid grid-cols-2 gap-3">
                <AmountInput label={`${market.quote.symbol} for bids`} value={draft.maxQuoteAllocation} onChange={(v) => set('maxQuoteAllocation', v)} unit={market.quote.symbol} error={err.maxQuoteAllocation} />
                <AmountInput label={`${market.base.symbol} for asks`} value={draft.maxBaseAllocation} onChange={(v) => set('maxBaseAllocation', v)} unit={market.base.symbol} error={err.maxBaseAllocation} />
              </div>
            </Section>
            <details className="group rounded-[var(--radius-panel)] bg-recessed" open={Boolean(err.reserveQuote || err.reserveBase)}>
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[14.5px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                More limits
                <ChevronDown className="size-4 text-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="space-y-5 px-4 pt-1 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <AmountInput label={`Keep in wallet (${market.quote.symbol})`} value={draft.reserveQuote} onChange={(v) => set('reserveQuote', v)} unit={market.quote.symbol} error={err.reserveQuote} />
                  <AmountInput label={`Keep in wallet (${market.base.symbol})`} value={draft.reserveBase} onChange={(v) => set('reserveBase', v)} unit={market.base.symbol} error={err.reserveBase} />
                </div>
                <RangeField label="Most of your committed funds on one side" min={50} max={100} step={5} value={draft.maxInventorySharePct} onChange={(v) => set('maxInventorySharePct', v)} format={(v) => `${v}%`} />
                <RangeField label="Oldest market read Korrin will act on" min={5} max={120} step={5} value={draft.maxDataAgeSeconds} onChange={(v) => set('maxDataAgeSeconds', v)} format={(v) => `${v}s`} hint="Anything older and Korrin waits." />
                <RangeField label="Orders per hour, at most" min={1} max={60} step={1} value={draft.maxActionsPerHour} onChange={(v) => set('maxActionsPerHour', v)} format={(v) => `${v}`} />
              </div>
            </details>
            {validation.warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 text-[13.5px] text-ink-2">
                <Info className="mt-0.5 size-4 shrink-0 text-muted" />
                {w}
              </p>
            ))}
          </div>
          <div className="hairline-t flex items-center justify-between border-line px-5 py-4">
            <Button variant="ghost" icon={<ChevronLeft className="size-4" />} onClick={onBack}>
              Order book
            </Button>
            <Button variant="primary" disabled={!validation.valid} onClick={onNext}>
              Review order
            </Button>
          </div>
        </section>
      </div>
    )

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <section className="card px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="title">Your first order</h2>
            {simulated ? <SourceBadge source="simulated" /> : <SourceBadge source="onchain" />}
          </div>
          {proposal && order && mandate ? (
            <>
              <p className="figure mt-4 text-[28px] leading-[1.15] text-structural">
                {order.side === 'buy' ? 'Bid' : 'Ask'} {formatAmount(order.amount, decimals)} {market.base.symbol} at {formatTickPrice(order.tick)}
              </p>
              <p className="mt-2 text-[15px] text-ink-2">When it fills, the same order flips to {order.side === 'buy' ? 'an ask' : 'a bid'} at {formatTickPrice(order.flipTick)}. You’ll sign it on the next screen.</p>
              <dl className="mt-6 grid gap-px overflow-hidden rounded-[var(--radius-panel)] bg-line sm:grid-cols-3">
                {[
                  ['Price', formatTickPrice(order.tick, 5)],
                  ['Flips to', formatTickPrice(order.flipTick, 5)],
                  ['Held by the DEX', `${formatAmount(order.escrowAmount, decimals)} ${order.escrowToken === 'quote' ? market.quote.symbol : market.base.symbol}`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-recessed px-4 py-3.5">
                    <dt className="label">{k}</dt>
                    <dd className="tabular mt-1 text-[15px] text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <details className="group mt-4">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
                  The exact call you’ll sign
                </summary>
                <dl className="mt-3 divide-y divide-line-faint rounded-[var(--radius-panel)] bg-recessed px-4">
                  {placeRows(mandate, order, minOrder ?? undefined).map((r) => (
                    <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5">
                      <dt className="text-[13.5px] text-muted">{r.label}</dt>
                      <dd className={cn('min-w-0 truncate text-right text-[14px] text-ink', r.mono && 'tabular text-[13.5px]')}>{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          ) : proposal ? (
            <p className="mt-4 text-[15px] leading-snug text-ink-2">
              Korrin wouldn’t place an order right now. {proposal.cause} {proposal.nextCondition ? `That changes when: ${proposal.nextCondition}` : ''}
            </p>
          ) : (
            <LoadingState label="Planning the first order" className="px-0" />
          )}
        </section>
        {corridorPanel(320)}
        {simulatedNote}
      </div>

      <section className="card min-w-0 self-start">
        <header className="px-5 pt-5">
          <h2 className="title">Your plan</h2>
          <p className="label mt-0.5">Korrin proposes orders only inside these limits</p>
        </header>
        <dl className="divide-y divide-line-faint px-5 pt-2">
          {mandate &&
            [
              ['Target', `${formatTickPrice(mandate.targetTick)} ${market.quote.symbol}`],
              ['Range', `${formatTickPrice(mandate.targetTick - mandate.bandTicks)} to ${formatTickPrice(mandate.targetTick + mandate.bandTicks)}`],
              ['Quotes at', `${formatTickPrice(mandate.targetTick - mandate.quoteOffsetTicks)} and ${formatTickPrice(mandate.targetTick + mandate.quoteOffsetTicks)}`],
              ['Bid and ask targets', `${formatAmount(BigInt(mandate.targetBidDepth), decimals, 0)} and ${formatAmount(BigInt(mandate.targetAskDepth), decimals, 0)} ${market.base.symbol}`],
              ['Largest order', `${formatAmount(BigInt(mandate.maxOrderAmount), decimals, 0)} ${market.base.symbol}`],
              ['Funds it can use', `${formatAmount(BigInt(mandate.maxQuoteAllocation), decimals, 0)} ${market.quote.symbol}, ${formatAmount(BigInt(mandate.maxBaseAllocation), decimals, 0)} ${market.base.symbol}`],
              ['Kept in wallet', `${formatAmount(BigInt(mandate.reserveQuote), decimals, 0)} ${market.quote.symbol}, ${formatAmount(BigInt(mandate.reserveBase), decimals, 0)} ${market.base.symbol}`],
              ['Signing', 'You approve every order'],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-[13.5px] text-muted">{k}</dt>
                <dd className="tabular-nums min-w-0 truncate text-right text-[14px] text-ink">{v}</dd>
              </div>
            ))}
        </dl>
        <details className="group mx-5 mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 py-2 text-[13.5px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
            Technical details
          </summary>
          {mandate && (
            <dl className="pb-2">
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-[13.5px] text-muted">Plan ID</dt>
                <dd className="tabular truncate text-[13px] text-ink">{mandate.policyDigest.slice(0, 18)}…</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-[13.5px] text-muted">Limits</dt>
                <dd className="tabular-nums text-right text-[13.5px] text-ink">
                  {mandate.maxInventoryShareBps / 100}% one side, {mandate.maxDataAgeSeconds}s reads, {mandate.maxActionsPerHour}/h
                </dd>
              </div>
            </dl>
          )}
        </details>
        <div className="hairline-t mt-2 border-line px-5 py-4">
          <div className="label mb-3">Funds this plan can use</div>
          <CapitalAllocation inventory={proposal?.inventory ?? null} decimals={decimals} baseSymbol={market.base.symbol} quoteSymbol={market.quote.symbol} />
        </div>
        <div className="hairline-t space-y-3 border-line px-5 py-4">
          {!owner && <OwnerPrompt />}
          <Button variant="primary" size="lg" className="w-full" disabled={!owner || !validation.valid} onClick={create}>
            Save and review the order
          </Button>
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} onClick={onBack}>
              Range and sizes
            </Button>
            <span className="text-right text-[13px] leading-snug text-muted">Saving signs nothing.</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function OwnerPrompt() {
  return (
    <div className="rounded-[var(--radius-panel)] bg-recessed p-3.5">
      <div className="text-[14.5px] font-medium text-ink">Who signs this market’s orders?</div>
      <p className="mt-0.5 text-[13.5px] leading-snug text-muted">Connect a browser wallet from the top bar, or create a testnet signer that stays in this browser.</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<KeyRound className="size-3.5" />} onClick={() => createTestnetSigner()}>
          Create testnet signer
        </Button>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
          <Wallet className="size-3.5" /> or use Connect in the top bar
        </span>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-[14px] font-medium text-ink-structural">{title}</legend>
      {children}
    </fieldset>
  )
}


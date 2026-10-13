'use client'

import { Ban, Pause, Play, Settings2, ShieldAlert, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Address } from 'viem'
import { ExecutionFlow } from '@/components/execution/execution-flow'
import { MandateStatusPill } from '@/components/mandate/status'
import { Button, ButtonLink } from '@/components/ui/button'
import { AmountInput, RangeField } from '@/components/ui/fields'
import { Modal } from '@/components/ui/overlay'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState, LoadingState } from '@/components/ui/states'
import { PairLabel, TokenIcon } from '@/components/ui/token'
import { useBalances, useOrderStates } from '@/lib/client/data'
import { cancelMandateOrder, type StageUpdate, withdrawDexBalance } from '@/lib/client/execute'
import { useActiveSigner } from '@/lib/client/signer'
import { patchMandate, recordAction, useHydrated, useMandates, useOrders } from '@/lib/client/store'
import { mandateToDraft, validateDraft } from '@/lib/mandate/draft'
import { pickPolicy, policyDigest } from '@/lib/mandate/digest'
import type { LiquidityMandate } from '@/lib/mandate/types'
import { formatTickPrice } from '@/lib/market/ticks'
import { PATH_USD } from '@/lib/tempo/chain'
import { formatAmount, toUnits } from '@/lib/units'

const TOKENS: { address: Address; symbol: string }[] = [
  { address: PATH_USD, symbol: 'PathUSD' },
  { address: '0x20c0000000000000000000000000000000000001', symbol: 'AlphaUSD' },
  { address: '0x20c0000000000000000000000000000000000002', symbol: 'BetaUSD' },
  { address: '0x20c0000000000000000000000000000000000003', symbol: 'ThetaUSD' },
]

type Flow = { kind: 'cancel-all'; ids: { orderId: string; mandateId: string }[] } | { kind: 'withdraw'; token: Address; symbol: string; amount: bigint } | null

export function RiskView() {
  const hydrated = useHydrated()
  const mandates = useMandates()
  const orders = useOrders()
  const signer = useActiveSigner()
  const open = useMemo(() => orders.filter((o) => !o.closedAt), [orders])
  const states = useOrderStates(open.map((o) => o.orderId))
  const balances = useBalances(signer?.address, TOKENS.map((t) => t.address))
  const [flow, setFlow] = useState<Flow>(null)
  const [editing, setEditing] = useState<LiquidityMandate | null>(null)

  const live = open.filter((o) => states.data?.orders.find((r) => r.orderId === o.orderId)?.status === 'live')
  const ownedLive = live.filter((o) => mandates.find((m) => m.id === o.mandateId)?.owner.toLowerCase() === signer?.address.toLowerCase())
  const active = mandates.filter((m) => m.status === 'active' || m.status === 'armed')

  const pauseAll = () => {
    for (const m of active) {
      patchMandate(m.id, { status: 'paused' })
      recordAction({ mandateId: m.id, kind: 'pause', stage: 'recorded', summary: 'Paused from Controls. Resting orders were left on the book.' })
    }
  }

  if (!hydrated) return <LoadingState label="Loading controls" />

  const dexTokens = (balances.data?.tokens ?? []).filter((t) => BigInt(t.dex) > 0n)
  const dexTotal = (balances.data?.tokens ?? []).reduce((acc, t) => acc + BigInt(t.dex), 0n)

  return (
    <>
      <header className="mb-8">
        <h1 className="page-title">Controls</h1>
        <p className="prose-body mt-2 max-w-[64ch] text-muted">Three separate controls, because they do different things. Pausing never removes an order. Cancelling never moves funds to your wallet. Only a withdraw does that.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <Control
          step="Stop new orders"
          icon={<Pause className="size-5" />}
          figure={active.length}
          figureLabel={active.length === 1 ? 'market can propose orders' : 'markets can propose orders'}
          body="Korrin stops proposing. Orders already on the book stay there and can still fill and flip."
          effect="Instant, in this browser. No transaction."
          action={
            <Button variant="secondary" size="lg" className="w-full" disabled={active.length === 0} onClick={pauseAll}>
              {active.length === 0 ? 'Nothing to pause' : `Pause ${active.length === 1 ? 'it' : `all ${active.length}`}`}
            </Button>
          }
        />
        <Control
          step="Take orders off the book"
          icon={<Ban className="size-5" />}
          figure={ownedLive.length}
          figureLabel={ownedLive.length === 1 ? 'order you own is on the book' : 'orders you own are on the book'}
          body="A signed cancel for each one, confirmed only when the DEX says the order no longer exists."
          effect="One transaction per order. Funds go to your DEX balance."
          action={
            <Button variant="quiet-danger" size="lg" className="w-full" disabled={ownedLive.length === 0} onClick={() => setFlow({ kind: 'cancel-all', ids: ownedLive.map((o) => ({ orderId: o.orderId, mandateId: o.mandateId })) })}>
              {ownedLive.length === 0 ? 'No orders to cancel' : `Cancel ${ownedLive.length === 1 ? 'it' : `all ${ownedLive.length}`}`}
            </Button>
          }
        />
        <Control
          step="Bring funds home"
          icon={<Undo2 className="size-5" />}
          figure={signer ? (balances.data ? formatAmount(dexTotal, 6) : '—') : '—'}
          figureLabel={signer ? 'USD sitting in your DEX balance' : 'Connect a signer to see its DEX balance'}
          body="Cancelled orders and fills land in the DEX balance. A withdraw moves them back to your wallet."
          effect="One transaction per token."
          action={
            dexTokens.length === 0 ? (
              <Button variant="secondary" size="lg" className="w-full" disabled>
                Nothing to withdraw
              </Button>
            ) : (
              <ul className="space-y-2">
                {dexTokens.map((t) => {
                  const sym = TOKENS.find((x) => x.address.toLowerCase() === t.address.toLowerCase())?.symbol ?? 'Token'
                  return (
                    <li key={t.address} className="flex items-center justify-between gap-3 rounded-[var(--radius-panel)] bg-recessed py-2 pr-2 pl-3">
                      <span className="flex items-center gap-2 text-[14px] text-ink-2">
                        <TokenIcon address={t.address} size={20} />
                        <span className="tabular text-ink">{formatAmount(BigInt(t.dex), 6)}</span> {sym}
                      </span>
                      <Button size="sm" variant="primary" onClick={() => setFlow({ kind: 'withdraw', token: t.address, symbol: sym, amount: BigInt(t.dex) })}>
                        Withdraw
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )
          }
        />
      </div>

      <Panel className="mt-5 min-w-0">
        <PanelHeader title="Limits for each market" description="Changing a limit creates a new plan version. Orders already on the book aren’t touched." />
        {mandates.length === 0 ? (
          <EmptyState title="No markets yet" body="Limits show up here once you set up a market." actions={<ButtonLink href="/app/mandates/new" variant="primary">Set up a market</ButtonLink>} />
        ) : (
          <ul className="hairline-t divide-y divide-line-faint border-line">
            {mandates.map((m) => {
              const liveCount = live.filter((o) => o.mandateId === m.id).length
              return (
                <li key={m.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <PairLabel base={m.base} quote={m.quote} size={22} />
                      <MandateStatusPill status={m.status} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[13.5px] text-muted">
                      <span>{m.name}</span>
                      <span>v{m.version}</span>
                      <span>{liveCount} on the book</span>
                    </div>
                    {m.status === 'paused' && liveCount > 0 && <p className="mt-1.5 text-[13.5px] text-ink-2">Paused, but {liveCount} {liveCount === 1 ? 'order is' : 'orders are'} still on the book.</p>}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-4">
                    <Limit label="Range" value={`${formatTickPrice(m.targetTick)} ±${m.bandTicks / 10} bp`} />
                    <Limit label="Largest order" value={`${formatAmount(BigInt(m.maxOrderAmount), m.base.decimals, 0)}`} />
                    <Limit label="Kept in wallet" value={`${formatAmount(BigInt(m.reserveQuote), 6, 0)} / ${formatAmount(BigInt(m.reserveBase), 6, 0)}`} />
                    <Limit label="Reads, rate" value={`${m.maxDataAgeSeconds}s, ${m.maxActionsPerHour}/h`} />
                  </dl>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {m.status === 'paused' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Play className="size-3.5" />}
                        onClick={() => {
                          patchMandate(m.id, { status: 'active' })
                          recordAction({ mandateId: m.id, kind: 'resume', stage: 'recorded', summary: 'Resumed from Controls.' })
                        }}
                      >
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Pause className="size-3.5" />}
                        disabled={m.status === 'closed'}
                        onClick={() => {
                          patchMandate(m.id, { status: 'paused' })
                          recordAction({ mandateId: m.id, kind: 'pause', stage: 'recorded', summary: 'Paused from Controls. Resting orders were left on the book.' })
                        }}
                      >
                        Pause
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon={<Settings2 className="size-3.5" />} onClick={() => setEditing(m)}>
                      Change limits
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <p className="mt-5 flex items-start gap-2.5 px-1 text-[13.5px] leading-snug text-muted">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        Korrin never holds your funds. Orders sit in Tempo’s DEX under your address, and only your signer can cancel or withdraw them.
      </p>

      {flow?.kind === 'cancel-all' && (
        <ExecutionFlow
          open
          destructive
          onOpenChange={(o) => !o && setFlow(null)}
          title={`Cancel ${flow.ids.length} ${flow.ids.length === 1 ? 'order' : 'orders'}`}
          description="Each order is cancelled with its own signed transaction and confirmed gone before the next one starts."
          rows={flow.ids.map((o) => ({ label: `Order ${o.orderId}`, value: 'StablecoinDEX.cancel', mono: true }))}
          confirmLabel="Sign and cancel all"
          notice="Funds from each cancelled order go to your DEX balance. Withdraw them separately."
          run={async (onStage) => {
            for (const [i, o] of flow.ids.entries()) {
              await cancelMandateOrder(o.mandateId, o.orderId, (u: StageUpdate) => onStage({ ...u, detail: `${i + 1}/${flow.ids.length} · ${u.detail ?? `order ${o.orderId}`}` }))
            }
            states.refresh()
          }}
        />
      )}
      {flow?.kind === 'withdraw' && (
        <ExecutionFlow
          open
          onOpenChange={(o) => !o && setFlow(null)}
          title={`Withdraw ${flow.symbol}`}
          description="Moves this token’s full DEX balance back to your wallet."
          rows={[
            { label: 'Call', value: 'StablecoinDEX.withdraw', mono: true },
            { label: 'Amount', value: `${formatAmount(flow.amount, 6)} ${flow.symbol}`, mono: true },
          ]}
          confirmLabel="Sign and withdraw"
          run={(onStage) => withdrawDexBalance(flow.token, flow.symbol, flow.amount, onStage).then(() => balances.refresh())}
        />
      )}
      {editing && <LimitsEditor mandate={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function Control({ step, icon, figure, figureLabel, body, effect, action }: { step: string; icon: React.ReactNode; figure: React.ReactNode; figureLabel: string; body: string; effect: string; action: React.ReactNode }) {
  return (
    <section className="card flex flex-col p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-recessed text-ink-2">{icon}</span>
        <h2 className="title">{step}</h2>
      </div>
      <div className="mt-6 flex items-baseline gap-2.5">
        <span className="figure text-[44px] text-ink">{figure}</span>
      </div>
      <p className="mt-1 text-[14px] text-muted">{figureLabel}</p>
      <p className="mt-5 text-[14.5px] leading-snug text-ink-2">{body}</p>
      <p className="mt-2 text-[13.5px] text-muted">{effect}</p>
      <div className="mt-6 flex-1" />
      {action}
    </section>
  )
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="tabular mt-0.5 whitespace-nowrap text-ink">{value}</dd>
    </div>
  )
}

function LimitsEditor({ mandate, onClose }: { mandate: LiquidityMandate; onClose: () => void }) {
  const [draft, setDraft] = useState(() => mandateToDraft(mandate))
  const v = validateDraft(draft, { decimals: mandate.base.decimals, minOrderAmount: 100_000_000n, baseSymbol: mandate.base.symbol, quoteSymbol: mandate.quote.symbol })
  const fieldErrors = [v.errors.maxOrderAmount, v.errors.reserveQuote, v.errors.reserveBase, v.errors.maxDataAgeSeconds, v.errors.maxActionsPerHour].filter(Boolean)
  const save = () => {
    const d = mandate.base.decimals
    const next: LiquidityMandate = {
      ...mandate,
      maxOrderAmount: toUnits(draft.maxOrderAmount, d).toString(),
      reserveQuote: toUnits(draft.reserveQuote, d).toString(),
      reserveBase: toUnits(draft.reserveBase, d).toString(),
      maxDataAgeSeconds: draft.maxDataAgeSeconds,
      maxActionsPerHour: draft.maxActionsPerHour,
      version: mandate.version + 1,
    }
    const digest = policyDigest(pickPolicy(next))
    patchMandate(mandate.id, { ...next, policyDigest: digest })
    recordAction({ mandateId: mandate.id, kind: 'policy', stage: 'recorded', summary: `Changed limits, now plan v${next.version} (plan ID ${digest.slice(0, 10)}…)` })
    onClose()
  }
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Change limits for ${mandate.name}`}
      description="Applies to new orders only. Orders already on the book stay as they are."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={fieldErrors.length > 0}>
            Save as v{mandate.version + 1}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <AmountInput label="Largest single order" value={draft.maxOrderAmount} onChange={(x) => setDraft({ ...draft, maxOrderAmount: x })} unit={mandate.base.symbol} error={v.errors.maxOrderAmount} />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput label={`Keep in wallet (${mandate.quote.symbol})`} value={draft.reserveQuote} onChange={(x) => setDraft({ ...draft, reserveQuote: x })} unit={mandate.quote.symbol} error={v.errors.reserveQuote} />
          <AmountInput label={`Keep in wallet (${mandate.base.symbol})`} value={draft.reserveBase} onChange={(x) => setDraft({ ...draft, reserveBase: x })} unit={mandate.base.symbol} error={v.errors.reserveBase} />
        </div>
        <RangeField label="Oldest market read Korrin will act on" min={5} max={120} step={5} value={draft.maxDataAgeSeconds} onChange={(x) => setDraft({ ...draft, maxDataAgeSeconds: x })} format={(x) => `${x}s`} />
        <RangeField label="Orders per hour, at most" min={1} max={60} step={1} value={draft.maxActionsPerHour} onChange={(x) => setDraft({ ...draft, maxActionsPerHour: x })} format={(x) => `${x}`} />
      </div>
    </Modal>
  )
}

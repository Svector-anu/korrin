'use client'

import { BadgeCheck, CircleX, ExternalLink } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { verifyMessage } from 'viem'
import { LiquidityCorridor } from '@/components/corridor/liquidity-corridor'
import { eventToItem, Timeline } from '@/components/execution/timeline'
import { DecisionStrip } from '@/components/mandate/decision'
import { CoverageMeter } from '@/components/mandate/health'
import { ButtonLink } from '@/components/ui/button'
import { Divider, KeyValue, PageHeader, Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState, LoadingState } from '@/components/ui/states'
import { SourceBadge, StatusPill } from '@/components/ui/status'
import { PairLabel } from '@/components/ui/token'
import { useEventsFor } from '@/lib/client/data'
import type { TrackedOrder } from '@/lib/client/store'
import { useMandateLive } from '@/lib/client/use-mandate-live'
import { decodeReport, digestMatches, reportMessage } from '@/lib/mandate/report'
import { formatTickPrice } from '@/lib/market/ticks'
import { explorerAddress, explorerTx, shortHex } from '@/lib/tempo/chain'
import { formatAmount } from '@/lib/units'

export function ReportView() {
  const raw = useSearchParams().get('d') ?? ''
  const report = useMemo(() => decodeReport(raw), [raw])
  const [sigOk, setSigOk] = useState<boolean | null>(null)
  const orders = useMemo<TrackedOrder[]>(() => (report?.orders ?? []).map((o) => ({ ...o, mandateId: report?.mandate.id ?? '', placedAt: '' })), [report])
  const live = useMandateLive(report?.mandate ?? null, orders)
  const earliest = orders.reduce<string | null>((m, o) => (m === null || BigInt(o.placedBlock) < BigInt(m) ? o.placedBlock : m), null)
  const events = useEventsFor(orders.map((o) => o.orderId), earliest)

  useEffect(() => {
    if (!report) return
    const message = reportMessage(report.mandate, report.orders.map((o) => o.orderId), report.issuedAt)
    verifyMessage({ address: report.signedBy, message, signature: report.signature })
      .then((ok) => setSigOk(ok && report.signedBy.toLowerCase() === report.mandate.owner.toLowerCase()))
      .catch(() => setSigOk(false))
  }, [report])

  if (!report)
    return (
      <Panel>
        <EmptyState title="This report link is incomplete" body="Ask the market’s owner for a fresh link, or watch the recorded session to see one run." actions={<ButtonLink href="/app/session" variant="primary">Watch the recorded session</ButtonLink>} />
      </Panel>
    )

  const m = report.mandate
  const digestOk = digestMatches(m)
  const timeline = (events.data?.events ?? []).map((e) => eventToItem(e, m.base.decimals, m.base.symbol)).reverse()

  return (
    <>
      <PageHeader
        meta={
          <>
            <StatusPill tone="info">Read-only report</StatusPill>
            <StatusPill tone="neutral">Testnet</StatusPill>
            <PairLabel base={m.base} quote={m.quote} size={18} className="text-[13.5px]" />
          </>
        }
        title={m.name}
        description={`Shared by its owner on ${new Date(report.issuedAt).toUTCString().replace(' GMT', ' UTC')}. Everything below is read live from Tempo now. Nothing here can sign or move funds.`}
      />

      <div className="mb-4 grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-line shadow-[var(--shadow-card)] md:grid-cols-3">
        <Check ok={digestOk} title={digestOk ? 'Plan matches the signature' : 'The plan was altered'} body={digestOk ? `The limits in this link hash to ${shortHex(m.policyDigest, 6, 4)}.` : 'The limits in this link don’t match what the owner signed. Don’t trust them.'} />
        <Check
          ok={sigOk}
          title={sigOk === null ? 'Checking signature…' : sigOk ? 'Signed by the owner' : 'Signature does not verify'}
          body={
            <a className="tabular hover:text-accent" href={explorerAddress(m.owner)} target="_blank" rel="noreferrer">
              {shortHex(report.signedBy, 6, 4)}
            </a>
          }
        />
        <Check ok={live.ordersBlock !== null} title="Orders read live" body={live.ordersBlock ? `getOrder at block #${Number(live.ordersBlock).toLocaleString('en-US')}` : 'Reading…'} />
      </div>

      <DecisionStrip proposal={live.proposal} paused={m.status === 'paused'} className="mb-4" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <Panel className="min-w-0">
          <PanelHeader title="Liquidity corridor" actions={<SourceBadge source="onchain" />} />
          <div className="px-3 pb-4 md:px-5">{live.corridor ? <LiquidityCorridor model={live.corridor} paused={m.status === 'paused'} height={400} /> : <LoadingState label="Reading the book" />}</div>
        </Panel>
        <Panel>
          <PanelHeader title="Policy and coverage" />
          <div className="space-y-4 px-5 pb-5">
            <CoverageMeter side="bid" own={live.proposal?.coverage.bid.own ?? 0n} target={BigInt(m.targetBidDepth)} decimals={m.base.decimals} symbol={m.base.symbol} />
            <CoverageMeter side="ask" own={live.proposal?.coverage.ask.own ?? 0n} target={BigInt(m.targetAskDepth)} decimals={m.base.decimals} symbol={m.base.symbol} />
            <Divider />
            <dl>
              <KeyValue label="Corridor">{`${formatTickPrice(m.targetTick - m.bandTicks)} to ${formatTickPrice(m.targetTick + m.bandTicks)}`}</KeyValue>
              <KeyValue label="Order cap" mono>{`${formatAmount(BigInt(m.maxOrderAmount), m.base.decimals, 0)} ${m.base.symbol}`}</KeyValue>
              <KeyValue label="Freshness limit">{m.maxDataAgeSeconds}s</KeyValue>
              <KeyValue label="Version" mono>v{m.version}</KeyValue>
            </dl>
          </div>
        </Panel>
      </div>

      <Panel className="mt-4">
        <PanelHeader title="Native orders" description="Order IDs the owner included, with their live DEX state." />
        <ul className="divide-y divide-line-faint">
          {live.orders.length === 0 && <li className="px-5 py-4 text-[14px] text-muted">No orders were included in this report.</li>}
          {live.orders.map((o) => {
            const r = o.readback
            return (
              <li key={o.orderId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[14px]">
                <span className="tabular text-ink">#{o.orderId}</span>
                <span className="text-ink-2">{r?.status === 'live' ? `${r.isBid ? 'Bid' : 'Ask'} at ${formatTickPrice(r.tick, 5)}, ${formatAmount(BigInt(r.remaining), m.base.decimals)} remaining` : r?.status === 'absent' ? 'No longer on the book' : 'Reading…'}</span>
                <a href={explorerTx(o.placedTx)} target="_blank" rel="noreferrer" className="tabular inline-flex items-center gap-1 text-accent hover:underline">
                  {shortHex(o.placedTx, 4, 4)} <ExternalLink className="size-3" />
                </a>
              </li>
            )
          })}
        </ul>
      </Panel>

      <Panel className="mt-4">
        <PanelHeader title="DEX events" description="Decoded from chain for the included orders." />
        <div className="hairline-t border-line">
          <Timeline items={timeline} emptyLabel={events.loading ? 'Reading events…' : 'No events found.'} />
        </div>
      </Panel>
    </>
  )
}

function Check({ ok, title, body }: { ok: boolean | null; title: string; body: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-surface px-5 py-4">
      {ok === false ? <CircleX className="mt-0.5 size-4 shrink-0 text-negative" /> : <BadgeCheck className={`mt-0.5 size-4 shrink-0 ${ok ? 'text-positive' : 'text-faint'}`} />}
      <div className="min-w-0 text-[14px]">
        <div className="text-ink">{title}</div>
        <div className="mt-0.5 text-[13.5px] text-muted">{body}</div>
      </div>
    </div>
  )
}

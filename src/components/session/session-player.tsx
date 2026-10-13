'use client'

import { ChevronLeft, ChevronRight, ExternalLink, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { LiquidityCorridor } from '@/components/corridor/liquidity-corridor'
import { ExceptionsPanel } from '@/components/health/exceptions-panel'
import { ReportPanel } from '@/components/health/report-panel'
import { DecisionStrip } from '@/components/mandate/decision'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/fields'
import { KeyValue, Panel, PanelHeader } from '@/components/ui/panel'
import { SourceBadge, StatusPill } from '@/components/ui/status'
import { cn } from '@/lib/cn'
import { NETWORK_INFO } from '@/lib/client/use-health'
import { type CapturedSession, frameCorridor, SESSION } from '@/lib/evidence/session'
import { assessFreshness } from '@/lib/health/build'
import { evaluateExceptions } from '@/lib/health/exceptions'
import { frameHealthReport } from '@/lib/health/replay'
import type { Proposal } from '@/lib/policy/plan'
import { explorerBlock, explorerTx, shortHex } from '@/lib/tempo/chain'
import { formatAmount } from '@/lib/units'

const SPEEDS = ['1', '2', '4'] as const
const MIN_DWELL_MS = 2_600

/**
 * Replays a captured real session frame by frame. Gaps between frames follow the
 * real capture timing divided by the shown speed factor, with a minimum dwell so
 * each state can be read.
 */
export function SessionPlayer({ session = SESSION, compact = false, autoPlay = false, initialIndex = 0 }: { session?: CapturedSession; compact?: boolean; autoPlay?: boolean; initialIndex?: number }) {
  const [index, setIndex] = useState(initialIndex)
  const [playing, setPlaying] = useState(autoPlay)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('1')
  const frames = session.frames
  const frame = frames[index]
  const last = index === frames.length - 1

  // The full player stops on the last step; the compact one loops.
  const isPlaying = playing && !(last && !compact)

  useEffect(() => {
    if (!isPlaying) return
    if (last) {
      const restart = setTimeout(() => setIndex(0), 4_000)
      return () => clearTimeout(restart)
    }
    const realGap = frames[index + 1].atMs - frame.atMs
    const dwell = Math.max(MIN_DWELL_MS, realGap / Number(speed))
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, frames.length - 1)), dwell)
    return () => clearTimeout(t)
  }, [isPlaying, index, speed, frames, frame.atMs, last])

  const corridor = useMemo(() => frameCorridor(session, frame), [session, frame])
  const health = useMemo(() => {
    if (compact) return null
    const report = frameHealthReport(session, frame, NETWORK_INFO)
    // Freshness as it was at capture time, so a replay is judged against its own moment.
    const freshness = assessFreshness(report, frame.book.observedAt + 2_000)
    return { report, freshness, exceptions: evaluateExceptions(report, { freshness }) }
  }, [compact, session, frame])
  const proposal = useMemo(
    () =>
      ({
        kind: frame.decision.kind,
        reasonCode: frame.decision.reasonCode,
        cause: frame.decision.cause,
        interpretation: frame.decision.interpretation,
        action: frame.decision.action,
        nextCondition: frame.decision.nextCondition,
      }) as Proposal,
    [frame],
  )
  const d = session.mandate.base.decimals

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" aria-label="Previous step" disabled={index === 0} onClick={() => setIndex(index - 1)} iconOnly>
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="primary"
        icon={isPlaying ? <Pause className="size-3.5" /> : last ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
        onClick={() => {
          if (last && !isPlaying) {
            setIndex(0)
            setPlaying(true)
          } else setPlaying(!isPlaying)
        }}
      >
        {isPlaying ? 'Pause' : last ? 'Replay' : 'Play'}
      </Button>
      <Button size="sm" variant="ghost" aria-label="Next step" disabled={last} onClick={() => setIndex(index + 1)} iconOnly>
        <ChevronRight className="size-4" />
      </Button>
      {!compact && <Segmented label="Speed" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} />}
    </div>
  )

  if (compact) {
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 items-center gap-2">
            <SourceBadge source="replay" />
            <span className="truncate text-[13.5px] text-ink">{frame.title}</span>
          </div>
          <span className="tabular text-[12.5px] text-muted">
            {index + 1}/{frames.length} · block {Number(frame.book.blockNumber).toLocaleString('en-US')}
          </span>
        </div>
        <LiquidityCorridor model={corridor} paused={frame.mandateStatus === 'paused'} height={330} />
        <p className="mt-2 px-1 text-[13.5px] leading-snug text-muted">{frame.narration}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          {controls}
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <SourceBadge source="replay" />
            <span>Real capture timing ÷ {speed}, at least {MIN_DWELL_MS / 1000}s per step</span>
          </div>
        </div>
        <ol className="hairline-t grid grid-cols-2 gap-px border-line bg-line sm:grid-cols-4 lg:grid-cols-7" aria-label="Session steps">
          {frames.map((f, i) => (
            <li key={f.index}>
              <button
                type="button"
                onClick={() => {
                  setIndex(i)
                  setPlaying(false)
                }}
                aria-current={i === index ? 'step' : undefined}
                className={cn('flex h-full w-full flex-col gap-1 bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:bg-hover', i === index && 'bg-raised')}
              >
                <span className="flex items-center gap-1.5">
                  <span className={cn('size-1.5 rounded-full', i < index ? 'bg-positive' : i === index ? 'bg-ink-structural' : 'bg-line-strong')} />
                  <span className="tabular text-[12px] text-muted">+{(f.atMs / 1000).toFixed(1)}s</span>
                </span>
                <span className={cn('text-[13px] leading-snug', i === index ? 'text-ink' : 'text-ink-2')}>{f.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </Panel>

      <DecisionStrip proposal={proposal} paused={frame.mandateStatus === 'paused'} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <Panel className="min-w-0">
          <PanelHeader
            title={frame.title}
            description={frame.narration}
            actions={
              <StatusPill tone={frame.mandateStatus === 'paused' ? 'hold' : frame.mandateStatus === 'active' ? 'positive' : 'info'}>{frame.mandateStatus === 'armed' ? 'Armed' : frame.mandateStatus === 'active' ? 'Active' : 'Paused'}</StatusPill>
            }
          />
          <div className="px-3 pb-3 md:px-5">
            <LiquidityCorridor model={corridor} paused={frame.mandateStatus === 'paused'} height={400} />
          </div>
        </Panel>
        <Panel className="min-w-0">
          <PanelHeader title="Evidence for this step" description="Recorded from chain at capture time." />
          <dl className="divide-y divide-line-faint px-5 pb-4">
            <KeyValue label="Book read at block" mono>
              <a href={explorerBlock(frame.book.blockNumber)} target="_blank" rel="noreferrer" className="hover:text-accent">
                {Number(frame.book.blockNumber).toLocaleString('en-US')}
              </a>
            </KeyValue>
            <KeyValue label="Actor">{frame.actor === 'test-taker' ? 'Korrin-owned test taker' : frame.actor === 'operator' ? 'Operator (signed)' : 'Korrin read service'}</KeyValue>
            {frame.tx ? (
              <>
                <KeyValue label="Transaction" mono>
                  <a href={explorerTx(frame.tx.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                    {shortHex(frame.tx.hash, 6, 4)} <ExternalLink className="size-3" />
                  </a>
                </KeyValue>
                <KeyValue label="Included in block" mono>
                  {Number(frame.tx.block).toLocaleString('en-US')}
                </KeyValue>
                <KeyValue label="DEX events">{frame.tx.events.length ? frame.tx.events.map((e) => e.event).join(' → ') : 'None (withdraw is a token transfer)'}</KeyValue>
              </>
            ) : (
              <KeyValue label="Transaction">None. Read-only or local step</KeyValue>
            )}
            {frame.orders.map((o) => (
              <KeyValue key={o.orderId} label={`getOrder(${o.orderId})`} mono>
                {o.status === 'live' ? `${o.isBid ? 'bid' : 'ask'} @ tick ${o.tick}, ${formatAmount(BigInt(o.remaining ?? '0'), d, 0)} left` : o.status === 'absent' ? 'OrderDoesNotExist' : o.status}
              </KeyValue>
            ))}
            {frame.balances.map((b) => (
              <KeyValue key={b.token} label={`${b.token.toLowerCase().endsWith('1') ? 'AlphaUSD' : 'PathUSD'} in DEX balance`} mono>
                {formatAmount(BigInt(b.dex), d)}
              </KeyValue>
            ))}
          </dl>
        </Panel>
      </div>

      {health && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <ReportPanel report={health.report} freshness={health.freshness} />
          <ExceptionsPanel exceptions={health.exceptions} incidents={[]} />
        </div>
      )}
    </div>
  )
}

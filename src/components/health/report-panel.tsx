'use client'

import { Check, Copy, Download, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { StatusPill, type Tone } from '@/components/ui/status'
import { Tooltip } from '@/components/ui/tooltip'
import type { Freshness } from '@/lib/health/build'
import type { CoverageMetric, InventoryBucket, LiquidityHealthReport, Metric, Quality } from '@/lib/health/types'
import { cn } from '@/lib/cn'
import { formatTickPrice } from '@/lib/market/ticks'
import { formatAmount } from '@/lib/units'

const QUALITY: Record<Quality, { tone: Tone; label: string }> = {
  HIGH: { tone: 'positive', label: 'High confidence' },
  DEGRADED: { tone: 'hold', label: 'Degraded' },
  UNAVAILABLE: { tone: 'negative', label: 'Unavailable' },
}

export function QualityBadge({ quality }: { quality: Quality }) {
  const q = QUALITY[quality]
  return <StatusPill tone={q.tone}>{q.label}</StatusPill>
}

/** An amount with its provenance. Unknown values show "Unknown" and why, never zero. */
function Amount({ metric, decimals, className }: { metric: Metric | undefined; decimals: number; className?: string }) {
  if (!metric) return <span className="text-faint">—</span>
  if (metric.value === null)
    return (
      <Tooltip content={metric.reasonIfNull ?? 'Unknown'}>
        <span className={cn('cursor-help whitespace-nowrap text-muted underline decoration-dotted underline-offset-4', className)}>{metric.lowerBound ? `≥ ${formatAmount(BigInt(metric.lowerBound), decimals)}` : 'Unknown'}</span>
      </Tooltip>
    )
  return <span className={cn('tabular text-ink', className)}>{formatAmount(BigInt(metric.value), decimals)}</span>
}

function Coverage({ c }: { c: CoverageMetric | undefined }) {
  if (!c) return <span className="text-faint">—</span>
  if (c.status === 'NOT_APPLICABLE') return <span className="text-muted">No target</span>
  if (c.status === 'UNKNOWN')
    return (
      <Tooltip content={c.reasonIfNull ?? 'Unknown'}>
        <span className="cursor-help text-muted underline decoration-dotted underline-offset-4">Unknown</span>
      </Tooltip>
    )
  return <span className={cn('tabular', c.status === 'MET' ? 'text-positive' : 'text-ink')}>{Math.round((c.ratio ?? 0) * 100)}%</span>
}

const BUCKETS: { key: keyof Omit<InventoryBucket, 'inflightActions'>; label: string; hint: string; cls: string }[] = [
  { key: 'committedResting', label: 'On the book', hint: 'Escrowed by the DEX for your verified resting orders', cls: 'bg-structural' },
  { key: 'idleWallet', label: 'Free in wallet', hint: 'Wallet balance above the reserve you keep back', cls: 'bg-structural/35' },
  { key: 'dexInternalFree', label: 'In DEX balance', hint: 'Left in the DEX after cancels and fills. Withdraw to use it again', cls: 'bg-info/60' },
  { key: 'reservedPolicy', label: 'Kept in reserve', hint: 'Held back by your plan and never quoted', cls: 'bg-[repeating-linear-gradient(135deg,var(--ink-faint)_0_2px,transparent_2px_4px)]' },
  { key: 'unreconciled', label: 'Unconfirmed', hint: 'Escrow of orders whose state could not be read back', cls: 'bg-negative/60' },
]

function InventoryRow({ symbol, bucket, decimals }: { symbol: string; bucket: InventoryBucket; decimals: number }) {
  const values = BUCKETS.map((b) => BigInt(bucket[b.key]))
  const total = values.reduce((a, v) => a + v, 0n)
  const pct = (v: bigint) => (total === 0n ? 0 : Number((v * 10_000n) / total) / 100)
  return (
    <div>
      <div className="flex items-baseline justify-between text-[14px]">
        <span className="text-ink">{symbol}</span>
        <span className="tabular text-muted">{formatAmount(total, decimals)}</span>
      </div>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        {BUCKETS.map((b, i) => (
          <span key={b.key} className={cn('h-full', b.cls)} style={{ width: `${pct(values[i])}%` }} />
        ))}
      </div>
      <dl className="mt-3 space-y-1.5 text-[13.5px]">
        {BUCKETS.map((b, i) =>
          values[i] === 0n && (b.key === 'unreconciled' || b.key === 'dexInternalFree') ? null : (
            <Tooltip key={b.key} content={b.hint}>
              <div className="flex cursor-default items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted">
                  <span className={cn('size-2 rounded-[2px]', b.cls)} aria-hidden />
                  {b.label}
                </dt>
                <dd className="tabular text-ink">{formatAmount(values[i], decimals)}</dd>
              </div>
            </Tooltip>
          ),
        )}
      </dl>
    </div>
  )
}

export function ReportPanel({ report, freshness }: { report: LiquidityHealthReport; freshness: Freshness | null }) {
  const [copied, setCopied] = useState(false)
  const d = report.market.decimals
  const m = report.mandate
  const band = report.methodology.band
  const json = () => JSON.stringify(report, null, 2)
  const copy = async () => {
    await navigator.clipboard.writeText(json())
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${report.reportId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const sides = [
    { side: 'Bids', dot: 'bg-bid', total: report.depth.totalBid, own: report.depth.ownBid, external: report.depth.externalBid, target: m?.targetBid, coverage: m?.coverageBid, gap: m?.shortfallBid },
    { side: 'Asks', dot: 'bg-ask', total: report.depth.totalAsk, own: report.depth.ownAsk, external: report.depth.externalAsk, target: m?.targetAsk, coverage: m?.coverageAsk, gap: m?.shortfallAsk },
  ]

  return (
    <section className="card min-w-0" aria-labelledby="health-title">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="health-title" className="title">
              Liquidity health report
            </h2>
            <QualityBadge quality={report.quality} />
          </div>
          <p className="label mt-1 flex flex-wrap gap-x-3">
            <span className="tabular">{report.reportId}</span>
            <span>Block {report.window.block ? Number(report.window.block).toLocaleString('en-US') : '—'}</span>
            {report.window.source === 'RECORDED_REPLAY' ? (
              <span>Recorded {report.window.observedAt ? new Date(report.window.observedAt).toUTCString().replace(' GMT', ' UTC') : ''}</span>
            ) : (
              freshness && <span className={cn(freshness.stale && 'text-ink')}>Read {freshness.ageSeconds ?? '?'}s ago, limit {freshness.maxAllowedAgeSeconds}s</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copy}>
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
          <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={download}>
            Download
          </Button>
        </div>
      </header>

      <div className="mt-4 overflow-x-auto px-2">
        <table className="w-full min-w-[540px] text-[13.5px]">
          <caption className="sr-only">Depth in your range, read from the DEX at the report block</caption>
          <thead>
            <tr className="text-[13px] text-muted">
              {['', 'In your range', 'Yours, verified', 'Everyone else', 'Target', 'Covered', 'Gap'].map((h) => (
                <th key={h} scope="col" className={cn('px-2.5 py-2 font-normal whitespace-nowrap', h ? 'text-right' : 'text-left')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sides.map((s) => (
              <tr key={s.side} className="hairline-t border-line-faint">
                <th scope="row" className="px-3 py-3 text-left font-normal">
                  <span className="flex items-center gap-2 text-ink-2">
                    <span className={cn('size-2 rounded-full', s.dot)} aria-hidden />
                    {s.side}
                  </span>
                </th>
                <td className="px-2.5 py-3 text-right">
                  <Amount metric={s.total} decimals={d} />
                </td>
                <td className="px-2.5 py-3 text-right">
                  <Amount metric={s.own} decimals={d} />
                </td>
                <td className="px-2.5 py-3 text-right">
                  <Amount metric={s.external} decimals={d} />
                </td>
                <td className="tabular px-2.5 py-3 text-right text-ink-2">{s.target ? formatAmount(BigInt(s.target), d, 0) : '—'}</td>
                <td className="px-2.5 py-3 text-right">
                  <Coverage c={s.coverage} />
                </td>
                <td className="px-2.5 py-3 text-right">
                  <Amount metric={s.gap} decimals={d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 pt-2 text-[13px] leading-snug text-muted">
        Range {formatTickPrice(band.lowTick)} to {formatTickPrice(band.highTick)} in {report.market.base}. Yours counts only orders read back from the DEX. Everyone else is the rest of each level, so nothing is counted twice.
      </p>

      {report.qualityReasons.length > 0 && (
        <ul className="mx-5 mt-4 space-y-1.5 rounded-[var(--radius-panel)] bg-recessed px-4 py-3 text-[13.5px] text-ink-2">
          {report.qualityReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {report.inventory && (
        <div className="hairline-t mt-5 border-line px-5 py-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[15px] font-medium text-ink">Where your funds are</h3>
            <span className="label">Balances at block {Number(report.inventory.readAtBlock).toLocaleString('en-US')}</span>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <InventoryRow symbol={report.market.quote} bucket={report.inventory.quote} decimals={d} />
            <InventoryRow symbol={report.market.base} bucket={report.inventory.base} decimals={d} />
          </div>
        </div>
      )}

      <footer className="hairline-t flex flex-wrap items-center gap-x-4 gap-y-1 border-line px-5 py-3.5 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" /> Digest <span className="tabular text-ink-2">{report.evidence.snapshotDigest.slice(0, 14)}…</span>
        </span>
        <span>{report.methodology.version}</span>
        <span>Plan v{report.methodology.policyVersion ?? '—'}</span>
        <span>Source: {report.window.source === 'ONCHAIN_READ' ? `read from ${report.window.rpcHost}` : 'recorded replay'}</span>
      </footer>
    </section>
  )
}

'use client'

import { CircleAlert, CircleCheck, CircleDot, Info, OctagonX } from 'lucide-react'
import { useState } from 'react'
import { Segmented } from '@/components/ui/fields'
import type { MarketException, Severity } from '@/lib/health/exceptions'
import type { Incident } from '@/lib/health/incidents'
import { cn } from '@/lib/cn'

const SEVERITY: Record<Severity, { icon: typeof CircleAlert; cls: string; label: string }> = {
  high: { icon: OctagonX, cls: 'bg-negative-soft text-negative', label: 'High' },
  medium: { icon: CircleAlert, cls: 'bg-hold-soft text-hold', label: 'Medium' },
  low: { icon: Info, cls: 'bg-info-soft text-info', label: 'Low' },
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity]
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', s.cls)} title={`${s.label} severity`}>
      <s.icon className="size-4" strokeWidth={1.75} aria-hidden />
      <span className="sr-only">{s.label} severity</span>
    </span>
  )
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const block = (b: string | null) => (b ? `#${Number(b).toLocaleString('en-US')}` : '—')

function ExceptionItem({ e }: { e: MarketException }) {
  return (
    <li className="flex gap-3 py-4 first:pt-1">
      <SeverityIcon severity={e.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-medium text-ink">{e.title}</span>
          {e.blocksNewOrders && <span className="rounded-full bg-recessed px-2 py-0.5 text-[12px] text-ink-2">Holds new orders</span>}
        </div>
        <p className="mt-1 text-[14px] leading-snug text-ink-2">{e.explanation}</p>
        <p className="mt-1.5 text-[14px] leading-snug text-ink">
          <span className="text-muted">What to do: </span>
          {e.recovery}
        </p>
        <p className="mt-2 flex flex-wrap gap-1.5">
          <span className="tabular rounded-full bg-recessed px-2 py-0.5 text-[11.5px] text-muted">{e.code}</span>
          {e.evidencePaths.slice(0, 3).map((p) => (
            <span key={p} className="tabular rounded-full border hairline border-line px-2 py-0.5 text-[11.5px] text-muted">
              {p}
            </span>
          ))}
        </p>
      </div>
    </li>
  )
}

function IncidentRow({ i }: { i: Incident }) {
  const open = !i.resolvedAt
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span aria-hidden className="absolute top-6 bottom-0 left-[11px] w-px bg-line last:hidden" />
      <span className={cn('relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', open ? 'bg-hold-soft text-hold' : 'bg-positive-soft text-positive')}>
        {open ? <CircleDot className="size-3.5" /> : <CircleCheck className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[14.5px] text-ink">{i.title}</span>
          <span className="text-[12.5px] text-muted">{open ? 'Open' : 'Resolved'}</span>
        </div>
        <p className="tabular mt-1 text-[12.5px] text-muted">
          Opened {time(i.openedAt)} at block {block(i.openedBlock)}
          {open ? `, last seen ${time(i.updatedAt)} at ${block(i.lastBlock)}` : `, resolved ${time(i.resolvedAt ?? i.updatedAt)} at ${block(i.resolvedBlock)}`}, {i.observations} {i.observations === 1 ? 'report' : 'reports'}
        </p>
        {i.orderIds.length > 0 && <p className="tabular mt-1 text-[12.5px] text-muted">Orders {i.orderIds.join(', ')}</p>}
      </div>
    </li>
  )
}

export function ExceptionsPanel({ exceptions, incidents }: { exceptions: MarketException[]; incidents: Incident[] }) {
  const [view, setView] = useState<'now' | 'timeline'>('now')
  return (
    <section className="card min-w-0" aria-labelledby="exceptions-title">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div>
          <h2 id="exceptions-title" className="title">
            Exceptions
          </h2>
          <p className="label mt-0.5">Checked against every new report. Nothing here comes from a model.</p>
        </div>
        <Segmented
          label="Exceptions view"
          value={view}
          onChange={setView}
          options={[
            { value: 'now', label: `Now${exceptions.length ? ` (${exceptions.length})` : ''}` },
            { value: 'timeline', label: 'Timeline' },
          ]}
        />
      </header>
      <div className="px-5 pt-3 pb-5">
        {view === 'now' ? (
          exceptions.length === 0 ? (
            <p className="flex items-start gap-2.5 py-2 text-[14.5px] text-ink-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-positive" />
              No exceptions. The latest report is complete, fresh and matches your plan.
            </p>
          ) : (
            <ul className="divide-y divide-line-faint">
              {exceptions.map((e) => (
                <ExceptionItem key={`${e.code}:${(e.orderIds ?? []).join(',')}:${e.title}`} e={e} />
              ))}
            </ul>
          )
        ) : incidents.length === 0 ? (
          <p className="py-2 text-[14.5px] text-muted">No incidents recorded yet. Korrin starts the log from the first report this browser reads.</p>
        ) : (
          <ol className="pt-2">
            {incidents.map((i) => (
              <IncidentRow key={i.id + i.openedAt} i={i} />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

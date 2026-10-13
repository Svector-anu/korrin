'use client'

import { Download, ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'
import { actionToItem, eventToItem, type TimelineItem, sortTimeline } from '@/components/execution/timeline'
import { TransactionDrawer } from '@/components/execution/transaction-drawer'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/fields'
import { Panel } from '@/components/ui/panel'
import { SourceBadge, StatusPill } from '@/components/ui/status'
import { LoadingState } from '@/components/ui/states'
import { type OrderEventDto, useEventsFor } from '@/lib/client/data'
import { useActions, useHydrated, useMandates, useOrders } from '@/lib/client/store'
import { cn } from '@/lib/cn'
import { SESSION } from '@/lib/evidence/session'
import { explorerTx, shortHex } from '@/lib/tempo/chain'

type Filter = 'all' | 'onchain' | 'wallet' | 'replay'

const replayItems: TimelineItem[] = SESSION.frames.flatMap((f) =>
  (f.tx?.events ?? []).map((e) => {
    const dto: OrderEventDto = {
      orderId: String(e.args.orderId ?? ''),
      event: e.event as OrderEventDto['event'],
      blockNumber: f.tx?.block ?? '0',
      transactionHash: f.tx?.hash ?? '0x',
      logIndex: e.logIndex,
      timestamp: Math.round((Date.parse(SESSION.capturedAt) + f.atMs) / 1000),
      args: e.args as OrderEventDto['args'],
    }
    return { ...eventToItem(dto, SESSION.mandate.base.decimals, SESSION.mandate.base.symbol, 'replay'), key: `replay:${dto.transactionHash}:${dto.logIndex}` }
  }),
)

export function ActivityView() {
  const hydrated = useHydrated()
  const actions = useActions()
  const orders = useOrders()
  const mandates = useMandates()
  const [filter, setFilter] = useState<Filter>('all')
  const [inspect, setInspect] = useState<TimelineItem | null>(null)
  const recent = useMemo(() => [...orders].sort((a, b) => Number(BigInt(b.placedBlock) - BigInt(a.placedBlock))).slice(0, 32), [orders])
  const fromBlock = recent.length ? recent.reduce((m, o) => (BigInt(o.placedBlock) < BigInt(m) ? o.placedBlock : m), recent[0].placedBlock) : null
  const events = useEventsFor(
    recent.map((o) => o.orderId),
    fromBlock,
  )

  const items = useMemo(() => {
    const symbolFor = (orderId: string) => {
      const o = orders.find((x) => x.orderId === orderId)
      return mandates.find((m) => m.id === o?.mandateId)?.base.symbol ?? 'base'
    }
    const onchain = (events.data?.events ?? []).map((e) => eventToItem(e, 6, symbolFor(e.orderId)))
    const local = actions.map(actionToItem)
    const all = [...onchain, ...local, ...replayItems]
    const keep = all.filter((i) => filter === 'all' || (filter === 'onchain' && i.source === 'onchain') || (filter === 'wallet' && (i.source === 'wallet' || i.source === 'local')) || (filter === 'replay' && i.source === 'replay'))
    return sortTimeline(keep)
  }, [events.data, actions, filter, orders, mandates])

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(items.map((i) => ({ title: i.title, source: i.source, at: i.atMs ? new Date(i.atMs).toISOString() : null, block: i.block, txHash: i.txHash, orderId: i.orderId, raw: i.raw })), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `korrin-activity-${new Date().toISOString().slice(0, 19)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const days = useMemo(() => {
    const groups: { day: string; items: TimelineItem[] }[] = []
    for (const item of items) {
      const day = item.atMs ? new Date(item.atMs).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Time unknown'
      const last = groups.at(-1)
      if (last?.day === day) last.items.push(item)
      else groups.push({ day, items: [item] })
    }
    return groups
  }, [items])

  return (
    <>
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="prose-body mt-2 max-w-[62ch] text-muted">Every order event and every action you signed, newest first. Each entry says where it came from. Select one to see its transaction and raw record.</p>
        </div>
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportJson} disabled={items.length === 0}>
          Export JSON
        </Button>
      </header>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Source"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'onchain', label: 'Read from Tempo' },
            { value: 'wallet', label: 'You signed' },
            { value: 'replay', label: 'Recorded session' },
          ]}
        />
        <span className="text-[13.5px] text-muted">{events.loading && !events.data && recent.length ? 'Reading DEX events…' : `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`}</span>
      </div>
      {!hydrated ? (
        <LoadingState label="Loading activity" />
      ) : days.length === 0 ? (
        <Panel>
          <p className="px-5 py-8 text-[14.5px] text-muted">Nothing from this source yet.</p>
        </Panel>
      ) : (
        <div className="space-y-6">
          {days.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2.5 px-1 text-[14px] font-medium text-ink-2">{g.day}</h2>
              <Panel className="overflow-hidden">
                <ul className="divide-y divide-line-faint">
                  {g.items.map((item) => (
                    <li key={item.key}>
                      <button type="button" onClick={() => setInspect(item)} className="grid w-full gap-x-5 gap-y-1.5 px-5 py-4 text-left transition-colors duration-150 hover:bg-hover md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center">
                        <span className="tabular text-[13.5px] text-muted">{item.atMs ? new Date(item.atMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'}</span>
                        <span className="flex min-w-0 gap-3">
                          <span
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full',
                              item.tone === 'positive' && 'bg-positive-soft text-positive',
                              item.tone === 'negative' && 'bg-negative-soft text-negative',
                              item.tone === 'info' && 'bg-info-soft text-info',
                              (item.tone === 'neutral' || item.tone === 'hold' || item.tone === 'unknown') && 'bg-recessed text-ink-2',
                            )}
                          >
                            {item.icon}
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[15px] text-ink">{item.title}</span>
                              {item.status && <StatusPill tone={item.status.tone}>{item.status.label}</StatusPill>}
                            </span>
                            {item.detail && <span className="mt-0.5 block text-[13.5px] leading-snug break-words text-muted">{item.detail}</span>}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted md:justify-end">
                          {item.orderId && <span className="tabular rounded-full bg-recessed px-2.5 py-0.5 text-ink-2">#{item.orderId}</span>}
                          {item.block && <span className="tabular">block {Number(item.block).toLocaleString('en-US')}</span>}
                          {item.txHash && (
                            <a href={explorerTx(item.txHash)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="tabular inline-flex items-center gap-1 text-accent hover:underline">
                              {shortHex(item.txHash, 6, 4)} <ExternalLink className="size-3" />
                            </a>
                          )}
                          <SourceBadge source={item.source} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            </section>
          ))}
        </div>
      )}
      <TransactionDrawer item={inspect} onOpenChange={(o) => !o && setInspect(null)} />
    </>
  )
}

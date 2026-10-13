'use client'

import { ArrowLeftRight, Ban, CircleDot, Coins, Droplets, FilePlus2, Pause, Play, Plus, Settings2, TriangleAlert, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Hex } from 'viem'
import type { OrderEventDto } from '@/lib/client/data'
import type { ActionRecord } from '@/lib/client/store'
import { cn } from '@/lib/cn'
import { formatTickPrice } from '@/lib/market/ticks'
import { explorerTx, shortHex } from '@/lib/tempo/chain'
import { formatAmount } from '@/lib/units'
import { type EvidenceSource, SourceBadge, StatusPill, type Tone } from '../ui/status'

export type TimelineItem = {
  key: string
  atMs: number | null
  block: string | null
  source: EvidenceSource
  title: string
  detail: ReactNode
  icon: ReactNode
  tone: Tone
  status?: { tone: Tone; label: string }
  txHash?: Hex
  orderId?: string
  raw?: unknown
}

const EVENT_COPY: Record<OrderEventDto['event'], { title: (e: OrderEventDto) => string; icon: ReactNode; tone: Tone }> = {
  OrderPlaced: { title: (e) => `Order ${e.orderId} placed`, icon: <Plus className="size-3.5" />, tone: 'info' },
  OrderFilled: { title: (e) => `Order ${e.orderId} ${e.args.partialFill ? 'partially filled' : 'filled'}`, icon: <Coins className="size-3.5" />, tone: 'positive' },
  OrderFlipped: { title: (e) => `Order ${e.orderId} flipped`, icon: <ArrowLeftRight className="size-3.5" />, tone: 'positive' },
  FlipFailed: { title: (e) => `Order ${e.orderId} failed to flip`, icon: <TriangleAlert className="size-3.5" />, tone: 'negative' },
  OrderCancelled: { title: (e) => `Order ${e.orderId} cancelled`, icon: <Ban className="size-3.5" />, tone: 'neutral' },
}

export function eventToItem(e: OrderEventDto, decimals: number, symbol: string, source: EvidenceSource = 'onchain'): TimelineItem {
  const copy = EVENT_COPY[e.event]
  const a = e.args
  let detail: ReactNode = null
  if (e.event === 'OrderPlaced')
    detail = `${a.isBid ? 'Bid' : 'Ask'} ${formatAmount(BigInt(String(a.amount)), decimals)} ${symbol} at ${formatTickPrice(Number(a.tick), 5)}${a.isFlipOrder ? `, flips to ${formatTickPrice(Number(a.flipTick), 5)}` : ''}`
  if (e.event === 'OrderFilled') detail = `${formatAmount(BigInt(String(a.amountFilled)), decimals)} ${symbol} taken by ${shortHex(String(a.taker), 4, 4)}`
  if (e.event === 'OrderFlipped') detail = `Same order ID now ${a.isBid ? 'bids' : 'asks'} ${formatAmount(BigInt(String(a.amount)), decimals)} ${symbol} at ${formatTickPrice(Number(a.tick), 5)}`
  if (e.event === 'FlipFailed') detail = `Reason selector ${String(a.reason)}. Not counted as liquidity on the book.`
  if (e.event === 'OrderCancelled') detail = 'Taken off the book. Its funds went to the DEX balance.'
  return {
    key: `${e.transactionHash}:${e.logIndex}`,
    atMs: e.timestamp ? e.timestamp * 1000 : null,
    block: e.blockNumber,
    source,
    title: copy.title(e),
    detail,
    icon: copy.icon,
    tone: copy.tone,
    txHash: e.transactionHash,
    orderId: e.orderId,
    raw: e,
  }
}

const ACTION_ICON: Record<ActionRecord['kind'], ReactNode> = {
  create: <FilePlus2 className="size-3.5" />,
  place: <Plus className="size-3.5" />,
  cancel: <Ban className="size-3.5" />,
  withdraw: <Undo2 className="size-3.5" />,
  faucet: <Droplets className="size-3.5" />,
  pause: <Pause className="size-3.5" />,
  resume: <Play className="size-3.5" />,
  policy: <Settings2 className="size-3.5" />,
  close: <CircleDot className="size-3.5" />,
}

const STAGE_TONE: Record<ActionRecord['stage'], { tone: Tone; label: string }> = {
  signing: { tone: 'neutral', label: 'Signing' },
  submitted: { tone: 'neutral', label: 'Submitted' },
  included: { tone: 'neutral', label: 'Included' },
  verifying: { tone: 'neutral', label: 'Verifying' },
  confirmed: { tone: 'positive', label: 'Verified' },
  failed: { tone: 'negative', label: 'Failed' },
  unknown: { tone: 'unknown', label: 'Unresolved' },
  recorded: { tone: 'neutral', label: 'Recorded' },
}

export function actionToItem(a: ActionRecord): TimelineItem {
  return {
    key: a.id,
    atMs: Date.parse(a.at),
    block: a.block ?? null,
    source: !a.txHash ? 'local' : a.kind === 'faucet' ? 'onchain' : 'wallet',
    title: a.summary,
    detail: a.error ?? a.readback ?? null,
    icon: ACTION_ICON[a.kind],
    tone: STAGE_TONE[a.stage].tone,
    status: STAGE_TONE[a.stage],
    txHash: a.txHash,
    orderId: a.orderId,
    raw: a,
  }
}

export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0) || Number(BigInt(b.block ?? '0') - BigInt(a.block ?? '0')))
}

function timeLabel(ms: number | null) {
  if (!ms) return 'time unknown'
  return new Date(ms).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short', hour12: false })
}

export function Timeline({ items, onSelect, emptyLabel = 'Nothing has happened yet.' }: { items: TimelineItem[]; onSelect?: (item: TimelineItem) => void; emptyLabel?: string }) {
  if (items.length === 0) return <p className="px-5 py-6 text-[14px] text-muted">{emptyLabel}</p>
  return (
    <ol className="relative">
      {items.map((item, i) => (
        <li key={item.key} className="relative">
          {i < items.length - 1 && <span aria-hidden className="absolute top-9 bottom-0 left-[31px] w-px bg-line" />}
          <button
            type="button"
            onClick={onSelect ? () => onSelect(item) : undefined}
            disabled={!onSelect}
            className={cn('flex w-full gap-3 px-5 py-3 text-left transition-colors duration-150', onSelect && 'hover:bg-hover focus-visible:bg-hover')}
          >
            <span
              className={cn(
                'relative z-10 mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border hairline bg-surface',
                item.tone === 'positive' && 'border-positive/40 text-positive',
                item.tone === 'negative' && 'border-negative/40 text-negative',
                item.tone === 'info' && 'border-info/40 text-info',
                (item.tone === 'neutral' || item.tone === 'hold' || item.tone === 'unknown') && 'border-line-strong text-ink-2',
              )}
            >
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[14px] text-ink">{item.title}</span>
                {item.status && <StatusPill tone={item.status.tone}>{item.status.label}</StatusPill>}
              </span>
              {item.detail && <span className="mt-0.5 block text-[13.5px] leading-snug break-words text-muted">{item.detail}</span>}
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                <SourceBadge source={item.source} />
                <span className="tabular">{timeLabel(item.atMs)}</span>
                {item.block && <span className="tabular">block {Number(item.block).toLocaleString('en-US')}</span>}
                {item.txHash && (
                  <a href={explorerTx(item.txHash)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="tabular text-accent hover:underline">
                    {shortHex(item.txHash, 6, 4)}
                  </a>
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

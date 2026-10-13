'use client'

import * as Popover from '@radix-ui/react-popover'
import { Bell, CircleAlert, CircleCheck, PauseCircle, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { type AttentionItem, useAttention } from '@/lib/client/attention'
import { cn } from '@/lib/cn'

const ICON: Record<AttentionItem['tone'], typeof Bell> = { negative: CircleAlert, hold: PauseCircle, info: Undo2 }

export function AttentionIcon({ tone, className }: { tone: AttentionItem['tone']; className?: string }) {
  const Icon = ICON[tone]
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full',
        tone === 'negative' && 'bg-negative-soft text-negative',
        tone === 'hold' && 'bg-hold-soft text-hold',
        tone === 'info' && 'bg-info-soft text-info',
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  )
}

export function AttentionList({ items, onNavigate }: { items: AttentionItem[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.key}>
          <Link href={item.href} onClick={onNavigate} className="flex gap-3 rounded-[var(--radius-panel)] px-2.5 py-2.5 transition-colors duration-150 hover:bg-hover">
            <AttentionIcon tone={item.tone} />
            <span className="min-w-0">
              <span className="block text-[14px] leading-snug font-medium text-ink">{item.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">{item.body}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Top-bar inbox. Everything in it is derived from chain reads and this browser's records. */
export function Inbox() {
  const { items } = useAttention()
  const [open, setOpen] = useState(false)
  const urgent = items.some((i) => i.tone === 'negative')
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={items.length ? `Needs you: ${items.length}` : 'Nothing needs you'}
          className="relative flex size-10 items-center justify-center rounded-full border hairline border-line text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink data-[state=open]:bg-hover"
        >
          <Bell className="size-[18px]" strokeWidth={1.6} />
          {items.length > 0 && (
            <span
              className={cn(
                'tabular absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-none ring-2 ring-canvas',
                urgent ? 'bg-negative text-white' : 'bg-primary text-primary-ink',
              )}
            >
              {items.length}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={10} className="z-50 w-[min(380px,calc(100vw-24px))] rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-float)] data-[state=open]:animate-[fade-in_160ms_var(--ease-out-quiet)]">
          <div className="hairline-b flex items-baseline justify-between border-line px-4 py-3">
            <span className="text-[15px] font-medium text-ink">Needs you</span>
            <span className="text-[13px] text-muted">{items.length ? `${items.length} open` : 'All clear'}</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {items.length === 0 ? (
              <div className="flex gap-3 px-2.5 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
                  <CircleCheck className="size-4" strokeWidth={1.75} />
                </span>
                <p className="text-[13.5px] leading-snug text-ink-2">Nothing needs you. Every order Korrin tracks matches what Tempo reports.</p>
              </div>
            ) : (
              <AttentionList items={items} onNavigate={() => setOpen(false)} />
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

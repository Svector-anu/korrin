'use client'

import { ExternalLink } from 'lucide-react'
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { LiquidityCorridor } from '@/components/corridor/liquidity-corridor'
import { SourceBadge } from '@/components/ui/status'
import { cn } from '@/lib/cn'
import { frameCorridor, SESSION } from '@/lib/evidence/session'
import { formatTickPrice } from '@/lib/market/ticks'
import { explorerTx, shortHex } from '@/lib/tempo/chain'
import { formatAmount } from '@/lib/units'

const STEP_LABEL = ['Set up', 'Placed', 'Filled, flipped', 'Flipped back', 'Paused', 'Cancelled', 'Withdrawn']

const ACTOR: Record<string, string> = { korrin: 'Korrin read the book', operator: 'The operator signed', 'test-taker': 'A test taker traded' }

const frames = SESSION.frames
/** Scroll distance per step on large screens, in viewport heights. */
const STEP_VH = 55

/**
 * The recorded lifecycle, advanced by scrolling on large screens and by the step
 * buttons everywhere. Every frame is a real capture from Tempo testnet.
 */
export function LifecycleStory() {
  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(1)
  const [scrollDriven, setScrollDriven] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => setScrollDriven(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!scrollDriven) return
    const onScroll = () => {
      const el = ref.current
      if (!el) return
      const travel = el.offsetHeight - window.innerHeight
      if (travel <= 0) return
      const progress = Math.min(1, Math.max(0, -el.getBoundingClientRect().top / travel))
      setIndex(Math.min(frames.length - 1, Math.floor(progress * frames.length)))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [scrollDriven])

  const goTo = (i: number) => {
    const el = ref.current
    if (!scrollDriven || !el) return setIndex(i)
    const travel = el.offsetHeight - window.innerHeight
    const top = el.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: top + ((i + 0.5) / frames.length) * travel, behavior: 'smooth' })
  }

  const frame = frames[index]
  const corridor = useMemo(() => frameCorridor(SESSION, frame), [frame])
  const order = frame.orders[0]
  const d = SESSION.mandate.base.decimals

  return (
    <div ref={ref} className="relative lg:h-[var(--story-h)]" style={{ '--story-h': `${frames.length * STEP_VH + 100}vh` } as CSSProperties}>
      <div className="lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:justify-center lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="display max-w-[16ch]">Place, fill, flip. One order ID.</h2>
            <p className="prose-body mt-4 max-w-[54ch]">When a flip order fills, Tempo puts it back on the other side under the same ID. Korrin follows that one ID through every step and checks each one against the book.</p>
          </div>
          <SourceBadge source="replay" />
        </div>

        <ol className="mt-8 flex gap-1.5 overflow-x-auto pb-1" aria-label="Lifecycle steps">
          {frames.map((f, i) => (
            <li key={f.index} className="min-w-[112px] flex-1">
              <button type="button" onClick={() => goTo(i)} aria-current={i === index ? 'step' : undefined} className="group w-full text-left">
                <span className={cn('block h-1 rounded-full transition-colors duration-300', i <= index ? 'bg-structural' : 'bg-line-strong')} />
                <span className={cn('mt-2.5 block text-[13.5px] transition-colors duration-200', i === index ? 'text-ink' : 'text-muted group-hover:text-ink-2')}>{STEP_LABEL[i] ?? f.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="card min-w-0 p-3 md:p-5">
            <LiquidityCorridor model={corridor} paused={frame.mandateStatus === 'paused'} height={340} />
          </div>
          <div className="card flex min-w-0 flex-col p-6" aria-live="polite">
            <span className="text-[13.5px] text-muted">{ACTOR[frame.actor]}</span>
            <h3 className="heading mt-2 text-structural">{frame.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{frame.narration}</p>
            <div className="flex-1" />
            <dl className="hairline-t mt-6 space-y-2 border-line pt-4 text-[14px]">
              {order && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Order {order.orderId}</dt>
                  <dd className="tabular text-right text-ink">
                    {order.status === 'live' && order.tick !== undefined ? `${order.isBid ? 'Bid' : 'Ask'} at ${formatTickPrice(order.tick)}, ${formatAmount(BigInt(order.remaining ?? '0'), d, 0)} left` : order.status === 'absent' ? 'Gone from the book' : order.status}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Book read at block</dt>
                <dd className="tabular text-ink">{Number(frame.book.blockNumber).toLocaleString('en-US')}</dd>
              </div>
              {frame.tx && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{frame.tx.events.length ? frame.tx.events.map((e) => e.event).join(' + ') : 'Transaction'}</dt>
                  <dd>
                    <a href={explorerTx(frame.tx.hash)} target="_blank" rel="noreferrer" className="tabular inline-flex items-center gap-1 text-accent hover:underline">
                      {shortHex(frame.tx.hash, 6, 4)} <ExternalLink className="size-3" />
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

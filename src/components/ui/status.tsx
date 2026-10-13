import { AlertTriangle, Check, CircleDashed, CircleHelp, Clock, Pause, Radio, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type Tone = 'positive' | 'negative' | 'info' | 'hold' | 'neutral' | 'unknown'

const toneClass: Record<Tone, string> = {
  positive: 'text-positive bg-positive-soft',
  negative: 'text-negative bg-negative-soft',
  info: 'text-info bg-info-soft',
  hold: 'text-hold bg-hold-soft',
  neutral: 'text-ink-2 bg-recessed',
  unknown: 'text-muted bg-recessed',
}

const toneIcon: Record<Tone, ReactNode> = {
  positive: <Check className="size-3" strokeWidth={2} aria-hidden />,
  negative: <X className="size-3" strokeWidth={2} aria-hidden />,
  info: <Radio className="size-3" strokeWidth={2} aria-hidden />,
  hold: <Pause className="size-3" strokeWidth={2} aria-hidden />,
  neutral: <Clock className="size-3" strokeWidth={2} aria-hidden />,
  unknown: <CircleHelp className="size-3" strokeWidth={2} aria-hidden />,
}

/** Compact status pill. Always carries text and an icon, never colour alone. */
export function StatusPill({ tone, children, icon, className }: { tone: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium leading-none whitespace-nowrap', toneClass[tone], className)}>
      {icon ?? toneIcon[tone]}
      {children}
    </span>
  )
}

/** Source-of-truth badge for evidence: onchain, wallet action, replay, simulated. */
export type EvidenceSource = 'onchain' | 'wallet' | 'replay' | 'simulated' | 'local'

const sourceLabel: Record<EvidenceSource, string> = {
  onchain: 'Read from Tempo',
  wallet: 'You signed',
  replay: 'Recorded on Tempo testnet',
  simulated: 'Preview with assumed balances',
  local: 'Saved in this browser',
}

export function SourceBadge({ source, className }: { source: EvidenceSource; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full border hairline px-2.5 text-[12.5px] leading-none whitespace-nowrap',
        source === 'onchain' && 'border-positive/35 text-positive',
        source === 'wallet' && 'border-line-strong text-ink-2',
        source === 'replay' && 'border-info/35 text-info',
        source === 'simulated' && 'border-dashed border-line-strong text-muted',
        source === 'local' && 'border-line text-muted',
        className,
      )}
    >
      {source === 'onchain' && <span className="size-1.5 rounded-full bg-positive" aria-hidden />}
      {source === 'replay' && <CircleDashed className="size-3" aria-hidden />}
      {source === 'simulated' && <AlertTriangle className="size-3" aria-hidden />}
      {sourceLabel[source]}
    </span>
  )
}

/** Small live/stale/offline dot with text for network and freshness indicators. */
export function SignalDot({ state, label, className }: { state: 'live' | 'stale' | 'offline' | 'idle'; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] text-ink-2', className)}>
      <span className="relative flex size-2 items-center justify-center" aria-hidden>
        <span
          className={cn(
            'size-1.5 rounded-full',
            state === 'live' && 'bg-positive shadow-[0_0_0_3px_var(--positive-soft)]',
            state === 'stale' && 'bg-transparent ring-1 ring-ink-2',
            state === 'offline' && 'bg-negative',
            state === 'idle' && 'bg-faint',
          )}
        />
      </span>
      {label}
    </span>
  )
}

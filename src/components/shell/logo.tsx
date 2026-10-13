import { cn } from '@/lib/cn'

/** Korrin mark: a corridor (two rails) with a resting bid and ask inside it. */
export function KorrinMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={cn('shrink-0', className)}>
      <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6.5" fill="var(--ink-structural)" />
      <line x1="7" y1="5.5" x2="7" y2="18.5" stroke="var(--ink-inverse)" strokeOpacity="0.38" strokeWidth="1.2" />
      <line x1="17" y1="5.5" x2="17" y2="18.5" stroke="var(--ink-inverse)" strokeOpacity="0.38" strokeWidth="1.2" />
      <rect x="9.4" y="10" width="2.2" height="8.5" rx="0.8" fill="var(--ink-inverse)" />
      <rect x="12.4" y="7" width="2.2" height="11.5" rx="0.8" fill="var(--ink-inverse)" fillOpacity="0.62" />
    </svg>
  )
}

export function KorrinWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <KorrinMark size={24} />
      <span className="font-display text-[18px] font-medium tracking-[-0.03em] text-structural">Korrin</span>
    </span>
  )
}

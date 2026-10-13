import { AlertOctagon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function EmptyState({ title, body, actions, icon, className }: { title: ReactNode; body?: ReactNode; actions?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-3 px-6 py-10', className)}>
      {icon && <div className="flex size-9 items-center justify-center rounded-[var(--radius-panel)] border hairline border-line-strong text-muted">{icon}</div>}
      <div>
        <div className="title">{title}</div>
        {body && <p className="prose-body mt-1 max-w-[52ch] text-[14.5px] text-muted">{body}</p>}
      </div>
      {actions && <div className="mt-1 flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorState({ title, reason, recovery, className }: { title: ReactNode; reason: ReactNode; recovery?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn('flex gap-3 rounded-[var(--radius-panel)] border hairline border-negative/30 bg-negative-soft px-4 py-3', className)}>
      <AlertOctagon className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
      <div className="min-w-0 text-[14px]">
        <div className="font-medium text-ink">{title}</div>
        <div className="mt-0.5 break-words text-ink-2">{reason}</div>
        {recovery && <div className="mt-2">{recovery}</div>}
      </div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-[var(--radius-xs)] bg-recessed', className)} />
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-col gap-2.5 px-5 py-6', className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <span className="label mt-1" aria-hidden>
        {label}
      </span>
    </div>
  )
}

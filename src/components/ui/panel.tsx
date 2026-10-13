import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Panel({ className, ...rest }: ComponentProps<'section'>) {
  return <section className={cn('card', className)} {...rest} />
}

export function PanelHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex items-start justify-between gap-4 px-5 pt-5 pb-3.5', className)}>
      <div className="min-w-0">
        <h2 className="title font-sans">{title}</h2>
        {description && <p className="label mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('hairline-t border-0 border-line', className)} />
}

export function PageHeader({ title, description, meta, actions }: { title: ReactNode; description?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 pb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {meta && <div className="mb-3 flex flex-wrap items-center gap-2">{meta}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="prose-body mt-2 max-w-[64ch] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** A labelled figure. `value` should already be formatted; units are rendered quieter. */
export function MetricReadout({
  label,
  value,
  unit,
  detail,
  tone,
  size = 'md',
  className,
}: {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  detail?: ReactNode
  tone?: 'bid' | 'ask' | 'muted'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="label">{label}</div>
      <div
        className={cn(
          'tabular mt-1 flex items-baseline gap-1.5 text-ink',
          size === 'lg' && 'text-[26px] leading-none tracking-[-0.03em]',
          size === 'md' && 'text-[17px] leading-tight',
          size === 'sm' && 'text-[14.5px] leading-tight',
          tone === 'bid' && 'text-bid',
          tone === 'ask' && 'text-ask',
          tone === 'muted' && 'text-muted',
        )}
      >
        <span className="truncate">{value}</span>
        {unit && <span className="font-sans text-[13px] tracking-normal text-muted">{unit}</span>}
      </div>
      {detail && <div className="label mt-1">{detail}</div>}
    </div>
  )
}

export function KeyValue({ label, children, mono = false }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="label shrink-0">{label}</dt>
      <dd className={cn('min-w-0 truncate text-right text-[14px] text-ink', mono && 'tabular text-[13.5px]')}>{children}</dd>
    </div>
  )
}

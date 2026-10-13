'use client'

import { type ReactNode, useId } from 'react'
import { cn } from '@/lib/cn'

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[14px] text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-negative" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="label">{hint}</p>
      )}
    </div>
  )
}

/** Numeric text input with a trailing unit. Keeps the raw string so users can type freely. */
export function AmountInput({
  label,
  value,
  onChange,
  unit,
  hint,
  error,
  inputMode = 'decimal',
  className,
}: {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  unit?: ReactNode
  hint?: ReactNode
  error?: string | null
  inputMode?: 'decimal' | 'numeric'
  className?: string
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div
        className={cn(
          'flex h-11 items-center rounded-[var(--radius-panel)] border hairline bg-surface px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]',
          error ? 'border-negative/60' : 'border-line-strong',
          className,
        )}
      >
        <input
          id={id}
          value={value}
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error) || undefined}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
          className="tabular min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
        />
        {unit && <span className="ml-2 shrink-0 text-[13px] text-muted">{unit}</span>}
      </div>
    </Field>
  )
}

export function TextInput({ label, value, onChange, hint, placeholder }: { label: ReactNode; value: string; onChange: (v: string) => void; hint?: ReactNode; placeholder?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-[var(--radius-panel)] border hairline border-line-strong bg-surface px-3.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
      />
    </Field>
  )
}

/** Keyboard-safe stepped range paired with a readout. */
export function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  hint,
}: {
  label: ReactNode
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  format: (v: number) => ReactNode
  hint?: ReactNode
}) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[14px] text-ink-2">
          {label}
        </label>
        <span className="tabular shrink-0 text-[14px] text-ink">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="korrin-range h-5 w-full min-w-0"
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
      />
      {hint && <p className="label">{hint}</p>}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-recessed p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 rounded-full px-3.5 text-[14px] text-muted transition-[background-color,color] duration-150 hover:text-ink',
            value === o.value && 'bg-surface text-ink shadow-[var(--shadow-card)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

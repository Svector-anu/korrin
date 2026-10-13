'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet-danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium select-none transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-[var(--ease-out-quiet)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover active:opacity-90 shadow-[var(--inset-highlight)]',
  secondary: 'border hairline border-line-strong text-ink hover:bg-hover hover:border-[color:var(--ink-faint)] active:bg-recessed',
  ghost: 'text-ink-2 hover:bg-hover hover:text-ink active:bg-recessed',
  danger: 'bg-negative text-white hover:opacity-90 active:opacity-85',
  'quiet-danger': 'border hairline border-line-strong text-negative hover:bg-negative-soft hover:border-negative/40',
}

const iconSizes: Record<Size, string> = { sm: 'size-8', md: 'size-10', lg: 'size-12' }

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[13.5px]',
  md: 'h-10 px-4.5 text-[14.5px]',
  lg: 'h-12 px-6 text-[15.5px]',
}

/** `iconOnly` renders a square button; give it an aria-label. */
type CommonProps = { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode; trailingIcon?: ReactNode; iconOnly?: boolean }

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  trailingIcon,
  iconOnly,
  className,
  children,
  disabled,
  ...rest
}: CommonProps & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(base, variants[variant], iconOnly ? iconSizes[size] : sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {trailingIcon}
    </button>
  )
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  iconOnly,
  className,
  children,
  ...rest
}: Omit<CommonProps, 'loading'> & ComponentProps<typeof Link>) {
  return (
    <Link className={cn(base, variants[variant], iconOnly ? iconSizes[size] : sizes[size], className)} {...rest}>
      {icon}
      {children}
      {trailingIcon}
    </Link>
  )
}

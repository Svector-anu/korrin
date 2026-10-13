'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/cn'
import { applyTheme, type ThemePreference } from '@/lib/client/theme'

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-preference'] })
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystem = () => {
    if (document.documentElement.dataset.themePreference === 'system') applyTheme('system')
  }
  media.addEventListener('change', onSystem)
  return () => {
    observer.disconnect()
    media.removeEventListener('change', onSystem)
  }
}

const getPreference = () => (document.documentElement.dataset.themePreference as ThemePreference | undefined) ?? 'system'

export function ThemeSwitcher({ className }: { className?: string }) {
  const preference = useSyncExternalStore(subscribe, getPreference, () => 'system' as ThemePreference)
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex items-center gap-0.5 rounded-full border hairline border-line p-0.5', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => applyTheme(value)}
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:text-ink',
              active && 'bg-recessed text-ink shadow-[var(--shadow-card)]',
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
          </button>
        )
      })}
    </div>
  )
}

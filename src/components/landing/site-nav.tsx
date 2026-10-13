'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { KorrinWordmark } from '../shell/logo'
import { ButtonLink } from '../ui/button'
import { ThemeSwitcher } from '../ui/theme-switcher'

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#tempo', label: 'On Tempo' },
  { href: '/#evidence', label: 'Evidence' },
  { href: '/developers', label: 'API' },
]

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className={cn('fixed inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-200', scrolled ? 'hairline-b border-line bg-glass backdrop-blur-xl' : 'border-transparent')}>
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-8 px-4 md:px-6">
        <Link href="/" aria-label="Korrin home">
          <KorrinWordmark />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-[14.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitcher className="hidden sm:inline-flex" />
          <ButtonLink href="/app" variant="primary">
            Open app
          </ButtonLink>
        </div>
      </div>
    </header>
  )
}

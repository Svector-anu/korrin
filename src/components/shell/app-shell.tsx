'use client'

import { Activity, BookOpenText, Braces, House, Menu, PlayCircle, ShieldHalf, SlidersHorizontal, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, Suspense, useState } from 'react'
import { AttentionProvider } from '@/lib/client/attention'
import { cn } from '@/lib/cn'
import { ThemeSwitcher } from '../ui/theme-switcher'
import { Inbox } from './inbox'
import { KorrinWordmark } from './logo'
import { NetworkCard, NetworkPill, useChainHead } from './network-status'
import { WalletControl } from './wallet-control'

const NAV = [
  { href: '/app', label: 'Home', icon: House, exact: true },
  { href: '/app/mandates', label: 'Your markets', icon: SlidersHorizontal },
  { href: '/app/markets', label: 'Order books', icon: BookOpenText },
  { href: '/app/activity', label: 'Activity', icon: Activity },
  { href: '/app/risk', label: 'Controls', icon: ShieldHalf },
] as const

const SESSION_LINK = { href: '/app/session', label: 'Recorded session', icon: PlayCircle }
const API_LINK = { href: '/developers', label: 'Market API', icon: Braces }

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

function sectionLabel(pathname: string) {
  if (pathname === '/app/mandates/new') return 'Set up a market'
  if (pathname.startsWith('/app/report')) return 'Signed report'
  if (pathname.startsWith(SESSION_LINK.href)) return SESSION_LINK.label
  return [...NAV].reverse().find((n) => isActive(pathname, n.href, 'exact' in n ? n.exact : false))?.label ?? 'Korrin'
}

function usePathnameSafe(): string {
  return usePathname() ?? ''
}

function NavItem({ href, label, icon: Icon, active, onNavigate }: { href: string; label: string; icon: typeof House; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-11 items-center gap-3 rounded-[12px] px-3 text-[15px] text-ink-2 transition-[background-color,color,box-shadow] duration-150 hover:bg-canvas/60 hover:text-ink',
        active && 'bg-canvas text-ink shadow-[var(--shadow-sheet)] hover:bg-canvas',
      )}
    >
      <Icon className={cn('size-[18px] text-muted transition-colors duration-150 group-hover:text-ink-2', active && 'text-ink-structural group-hover:text-ink-structural')} strokeWidth={1.6} />
      {label}
    </Link>
  )
}

function NavLinksFor({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Workspace" className="flex flex-col gap-1">
      {NAV.map((n) => (
        <NavItem key={n.href} {...n} active={isActive(pathname, n.href, 'exact' in n ? n.exact : false)} onNavigate={onNavigate} />
      ))}
      <div className="hairline-t mx-3 my-3 border-line-strong/70" />
      <NavItem {...SESSION_LINK} active={pathname.startsWith(SESSION_LINK.href)} onNavigate={onNavigate} />
      <NavItem {...API_LINK} active={false} onNavigate={onNavigate} />
    </nav>
  )
}

function ActiveNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <NavLinksFor pathname={usePathnameSafe()} onNavigate={onNavigate} />
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavLinksFor pathname="" onNavigate={onNavigate} />}>
      <ActiveNavLinks onNavigate={onNavigate} />
    </Suspense>
  )
}

function SectionLabel() {
  return <span className="truncate text-[15px] font-medium text-ink">{sectionLabel(usePathnameSafe())}</span>
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const head = useChainHead()
  return (
    <AttentionProvider>
      <div className="min-h-dvh bg-canvas lg:bg-shell">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[256px] flex-col px-4 pt-5 pb-4 lg:flex">
          <Link href="/" className="mb-8 px-3" aria-label="Korrin home">
            <KorrinWordmark />
          </Link>
          <NavLinks />
          <div className="mt-auto space-y-3">
            <NetworkCard head={head} />
            <div className="flex items-center justify-between px-1">
              <span className="text-[13px] text-muted">Appearance</span>
              <ThemeSwitcher />
            </div>
          </div>
        </aside>

        {/* Keeps the gap above the sheet the shell colour while the page scrolls under it. */}
        <div aria-hidden className="fixed inset-x-0 top-0 z-30 hidden h-2.5 bg-shell lg:left-[256px] lg:block" />

        <div className="lg:pt-2.5 lg:pr-2.5 lg:pb-2.5 lg:pl-[256px]">
          <div className="min-h-dvh bg-canvas lg:min-h-[calc(100dvh-20px)] lg:rounded-[var(--radius-sheet)] lg:shadow-[var(--shadow-sheet)]">
            <header className="hairline-b sticky top-0 z-20 flex h-16 items-center gap-3 border-line bg-canvas/85 px-4 backdrop-blur-xl md:px-6 lg:top-2.5 lg:rounded-t-[var(--radius-sheet)] lg:px-8">
              <button type="button" className="-ml-1 flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-hover lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
                <Menu className="size-5" strokeWidth={1.6} />
              </button>
              <Link href="/" className="lg:hidden" aria-label="Korrin home">
                <KorrinWordmark />
              </Link>
              <span className="hidden min-w-0 lg:block">
                <Suspense fallback={null}>
                  <SectionLabel />
                </Suspense>
              </span>
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden sm:inline-flex lg:hidden">
                  <NetworkPill head={head} />
                </span>
                <Inbox />
                <WalletControl />
              </div>
            </header>
            <main className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-16 md:px-6 md:pt-8 lg:px-8">{children}</main>
          </div>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-overlay" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-shell px-4 pt-5 pb-4 shadow-[var(--shadow-widget)] animate-[drawer-in_200ms_var(--ease-out-quiet)]">
              <div className="mb-8 flex items-center justify-between px-3">
                <KorrinWordmark />
                <button type="button" onClick={() => setMobileOpen(false)} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-hover" aria-label="Close navigation">
                  <X className="size-4.5" />
                </button>
              </div>
              <NavLinks onNavigate={() => setMobileOpen(false)} />
              <div className="mt-auto space-y-3">
                <NetworkCard head={head} />
                <div className="flex items-center justify-between px-1">
                  <span className="text-[13px] text-muted">Appearance</span>
                  <ThemeSwitcher />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AttentionProvider>
  )
}

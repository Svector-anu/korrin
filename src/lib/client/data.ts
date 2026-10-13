'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Address, Hex } from 'viem'

type TokenDto = { address: Address; name: string; symbol: string; decimals: number; currency: string; quoteToken: Address | null; paused: boolean }

export type MarketDto = { bookKey: Hex; index: number; base: TokenDto; quote: TokenDto; bestBidTick: number; bestAskTick: number; canonical: boolean }
export type MarketListDto = { markets: MarketDto[]; blockNumber: string; observedAt: number; source: string; scanned: number; skipped: number }

export type LevelDto = { tick: number; isBid: boolean; status: 'ok' | 'unreadable'; liquidity: string | null; head: string | null; error?: string }
export type QuoteDto = { side: 'sell_base' | 'buy_base'; amountIn: string; amountOut: string | null; error?: string }
export type SnapshotDto = {
  chainId: number
  blockNumber: string
  observedAt: number
  source: string
  bookKey: Hex
  base: TokenDto
  quote: TokenDto
  bestBidTick: number
  bestAskTick: number
  exists: boolean
  levels: LevelDto[]
  quotes: QuoteDto[]
  constants: { minOrderAmount: string; tickSpacing: number; minTick: number; maxTick: number }
}

export type OrderDto =
  | { orderId: string; status: 'live'; maker: Address; bookKey: Hex; isBid: boolean; tick: number; amount: string; remaining: string; isFlip: boolean; flipTick: number }
  | { orderId: string; status: 'absent' }
  | { orderId: string; status: 'unknown'; error: string }
export type OrdersDto = { blockNumber: string; observedAt: number; orders: OrderDto[] }

export type BalancesDto = { blockNumber: string; observedAt: number; tokens: { address: Address; wallet: string; dex: string }[] }

export type OrderEventDto = {
  orderId: string
  event: 'OrderPlaced' | 'OrderFilled' | 'OrderFlipped' | 'FlipFailed' | 'OrderCancelled'
  blockNumber: string
  transactionHash: Hex
  logIndex: number
  timestamp: number | null
  args: Record<string, string | number | boolean>
}

const REFRESH_EVENT = 'korrin:refresh'

/** Asks every live read on the page to re-fetch now, e.g. after a confirmed transaction. */
export function requestRefresh(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REFRESH_EVENT))
}

export type Polled<T> = {
  data: T | null
  error: string | null
  loading: boolean
  /** When the last successful response was received by this browser. */
  receivedAt: number | null
  refresh: () => void
}

/**
 * Polls a JSON endpoint. Keeps the last good value on error so the UI can show it
 * as stale with its real age instead of blanking or inventing a value.
 */
export function usePolled<T>(url: string | null, intervalMs: number): Polled<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [receivedAt, setReceivedAt] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)
  const urlRef = useRef(url)

  useEffect(() => {
    if (urlRef.current !== url) {
      urlRef.current = url
      setData(null)
      setReceivedAt(null)
      setError(null)
    }
    if (!url) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
        const body = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
        setData(body as T)
        setError(null)
        setReceivedAt(Date.now())
      } catch (e) {
        if (cancelled || controller.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) {
          setLoading(false)
          if (intervalMs > 0) timer = setTimeout(run, intervalMs)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [url, intervalMs, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  useEffect(() => {
    window.addEventListener(REFRESH_EVENT, refresh)
    return () => window.removeEventListener(REFRESH_EVENT, refresh)
  }, [refresh])
  return { data, error, loading, receivedAt, refresh }
}

export const useMarkets = () => usePolled<MarketListDto>('/api/markets', 30_000)

export function useSnapshot(base: Address | null, quote: Address | null, window: { from: number; to: number } | null, intervalMs = 6_000) {
  const url = base && window ? `/api/markets/${base}?from=${window.from}&to=${window.to}${quote ? `&quote=${quote}` : ''}` : null
  return usePolled<SnapshotDto>(url, intervalMs)
}

export function useOrderStates(ids: string[], intervalMs = 6_000) {
  const url = ids.length ? `/api/orders?ids=${ids.join(',')}` : null
  return usePolled<OrdersDto>(url, intervalMs)
}

export function useBalances(account: Address | null | undefined, tokens: Address[], intervalMs = 10_000) {
  const url = account && tokens.length ? `/api/balances?account=${account}&tokens=${tokens.join(',')}` : null
  return usePolled<BalancesDto>(url, intervalMs)
}

export function useOrderEvents(orderId: string | null, fromBlock: string | null, intervalMs = 15_000) {
  const url = orderId && fromBlock ? `/api/orders/${orderId}/events?fromBlock=${fromBlock}` : null
  return usePolled<{ toBlock: string; events: OrderEventDto[] }>(url, intervalMs)
}

let clock = 0
const clockListeners = new Set<() => void>()
let clockTimer: ReturnType<typeof setInterval> | undefined

function subscribeClock(listener: () => void) {
  clockListeners.add(listener)
  if (!clockTimer) {
    clock = Date.now()
    clockTimer = setInterval(() => {
      clock = Date.now()
      clockListeners.forEach((l) => l())
    }, 1_000)
  }
  return () => {
    clockListeners.delete(listener)
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer)
      clockTimer = undefined
    }
  }
}

/** Shared one-second clock for age labels. Returns 0 during prerender. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, () => clock, () => 0)
}

export function ageLabel(fromMs: number | null, now: number): string {
  if (!fromMs || !now) return 'not yet observed'
  const s = Math.max(0, Math.round((now - fromMs) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export function useEventsFor(ids: string[], fromBlock: string | null, intervalMs = 12_000) {
  const url = ids.length && fromBlock ? `/api/events?ids=${ids.join(',')}&fromBlock=${fromBlock}` : null
  return usePolled<{ toBlock: string; events: OrderEventDto[] }>(url, intervalMs)
}

export type BookStateDto = Omit<SnapshotDto, 'levels' | 'quotes'>

export function useBookState(base: Address | null, quote: Address | null, intervalMs = 4_000) {
  const url = base ? `/api/markets/${base}/book${quote ? `?quote=${quote}` : ''}` : null
  return usePolled<BookStateDto>(url, intervalMs)
}

'use client'

import { createContext, type ReactNode, useContext, useMemo } from 'react'
import type { Address } from 'viem'
import { PATH_USD } from '@/lib/tempo/chain'
import { formatAmount } from '@/lib/units'
import { type BalancesDto, type OrderDto, type OrdersDto, type Polled, useBalances, useOrderStates } from './data'
import { useActiveSigner } from './signer'
import { useActions, useMandates, useOrders } from './store'

/** The faucet-issued USD tokens on Moderato, with the symbols their TIP-20 contracts report. */
export const USD_TOKEN_LIST: { address: Address; symbol: string }[] = [
  { address: PATH_USD, symbol: 'PathUSD' },
  { address: '0x20c0000000000000000000000000000000000001', symbol: 'AlphaUSD' },
  { address: '0x20c0000000000000000000000000000000000002', symbol: 'BetaUSD' },
  { address: '0x20c0000000000000000000000000000000000003', symbol: 'ThetaUSD' },
]
export const USD_TOKENS: Address[] = USD_TOKEN_LIST.map((t) => t.address)

export function usdSymbol(address: string): string {
  return USD_TOKEN_LIST.find((t) => t.address.toLowerCase() === address.toLowerCase())?.symbol ?? `${address.slice(0, 6)}…`
}

export type AttentionItem = {
  key: string
  tone: 'negative' | 'hold' | 'info'
  title: string
  body: string
  href: string
}

type Attention = {
  items: AttentionItem[]
  /** Read-back state for every open tracked order, keyed by order ID. */
  orderStates: Polled<OrdersDto>
  byId: Map<string, OrderDto>
  balances: Polled<BalancesDto>
}

const AttentionContext = createContext<Attention | null>(null)

/**
 * One set of chain reads for the whole workspace. The top-bar inbox and the home
 * screen both read from here, so they can never disagree about what needs the operator.
 */
export function AttentionProvider({ children }: { children: ReactNode }) {
  const mandates = useMandates()
  const orders = useOrders()
  const actions = useActions()
  const signer = useActiveSigner()
  const open = useMemo(() => orders.filter((o) => !o.closedAt), [orders])
  const orderStates = useOrderStates(open.map((o) => o.orderId))
  const balances = useBalances(signer?.address, USD_TOKENS)
  const byId = useMemo(() => new Map((orderStates.data?.orders ?? []).map((o) => [o.orderId, o])), [orderStates.data])

  const items = useMemo<AttentionItem[]>(() => {
    const marketHref = (id: string) => `/app/mandates/${id}`
    const unresolved = open.filter((o) => byId.get(o.orderId)?.status === 'unknown')
    const failed = actions.filter((a) => a.stage === 'unknown' || a.stage === 'failed').slice(0, 5)
    const pausedWithOrders = mandates.filter((m) => m.status === 'paused' && open.some((o) => o.mandateId === m.id))
    const withdrawable = (balances.data?.tokens ?? []).filter((t) => BigInt(t.dex) > 0n)
    return [
      ...unresolved.map((o) => ({
        key: `u-${o.orderId}`,
        tone: 'negative' as const,
        title: `Order ${o.orderId} isn't confirmed`,
        body: "Korrin couldn't read it back from the DEX. This market waits until it can.",
        href: marketHref(o.mandateId),
      })),
      ...failed.map((a) => ({
        key: `a-${a.id}`,
        tone: 'negative' as const,
        title: a.summary,
        body: a.error ?? (a.stage === 'unknown' ? 'The outcome is unknown. Check the order on the market screen before trying again.' : 'This action failed.'),
        href: a.mandateId ? marketHref(a.mandateId) : '/app/activity',
      })),
      ...pausedWithOrders.map((m) => ({
        key: `p-${m.id}`,
        tone: 'hold' as const,
        title: `${m.name} is paused with orders on the book`,
        body: 'Pausing stops new orders. The resting ones can still fill until you cancel them.',
        href: marketHref(m.id),
      })),
      ...withdrawable.map((t) => ({
        key: `w-${t.address}`,
        tone: 'info' as const,
        title: `${formatAmount(BigInt(t.dex), 6)} ${usdSymbol(t.address)} is in your DEX balance`,
        body: 'Cancelled orders and fills land here. Withdraw it to move it back to your wallet.',
        href: '/app/risk',
      })),
    ]
  }, [open, byId, actions, mandates, balances.data])

  const value = useMemo(() => ({ items, orderStates, byId, balances }), [items, orderStates, byId, balances])
  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>
}

export function useAttention(): Attention {
  const value = useContext(AttentionContext)
  if (!value) throw new Error('useAttention must be used inside AttentionProvider')
  return value
}

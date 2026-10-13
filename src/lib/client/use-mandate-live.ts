'use client'

import { useEffect, useMemo } from 'react'
import { buildLevels, type CorridorModel, type CorridorOrder } from '@/components/corridor/model'
import type { LiquidityMandate } from '../mandate/types'
import { hasBestAsk, hasBestBid } from '../market/ticks'
import { mandateBand, type OwnOrderState, plan, type PlanningSnapshot, type Proposal } from '../policy/plan'
import { CHAIN_ID } from '../tempo/chain'
import { type BalancesDto, type BookStateDto, type OrderDto, type SnapshotDto, useBalances, useBookState, useNow, useOrderStates, useSnapshot } from './data'
import { useActiveSigner } from './signer'
import { closeOrder, type TrackedOrder, useActions, useOrders } from './store'

export type LiveOrder = TrackedOrder & {
  readback: OrderDto | null
  /** Current side after any flips, from readback. */
  currentIsBid: boolean | null
  flipped: boolean
}

export type MandateLive = {
  snapshot: SnapshotDto | null
  book: BookStateDto | null
  snapshotError: string | null
  snapshotReceivedAt: number | null
  balances: BalancesDto | null
  balancesError: string | null
  orders: LiveOrder[]
  ordersBlock: string | null
  ordersError: string | null
  proposal: Proposal | null
  planningSnapshot: PlanningSnapshot | null
  corridor: CorridorModel | null
  window: { from: number; to: number }
  now: number
  signerMatches: boolean
  refresh: () => void
}

/**
 * Joins live chain reads (book levels, native order state, balances) with the
 * mandate policy and runs the pure planner. Nothing here signs.
 */
export function useMandateLive(mandate: LiveMandateInput | null, externalOrders?: TrackedOrder[]): MandateLive {
  const allOrders = useOrders()
  const actions = useActions()
  const signer = useActiveSigner()
  const now = useNow()

  const band = mandate ? mandateBand(mandate) : null
  const margin = mandate ? Math.max(30, Math.round(mandate.bandTicks * 0.6)) : 0
  const window = useMemo(
    () => (band ? { from: Math.floor((band.lowTick - margin) / 10) * 10, to: Math.ceil((band.highTick + margin) / 10) * 10 } : { from: 0, to: 0 }),
    [band?.lowTick, band?.highTick, margin],
  )

  const tracked = useMemo(() => (externalOrders ? externalOrders : mandate ? allOrders.filter((o) => o.mandateId === mandate.id && !o.closedAt) : []), [allOrders, mandate, externalOrders])
  const ids = useMemo(() => tracked.map((o) => o.orderId), [tracked])

  const snap = useSnapshot(mandate?.base.address ?? null, mandate?.quote.address ?? null, mandate ? window : null)
  const book = useBookState(mandate?.base.address ?? null, mandate?.quote.address ?? null)
  const orderStates = useOrderStates(ids)
  const tokens = useMemo(() => (mandate ? [mandate.base.address, mandate.quote.address] : []), [mandate])
  const balances = useBalances(mandate?.owner ?? null, tokens)

  const liveOrders = useMemo<LiveOrder[]>(
    () =>
      tracked.map((o) => {
        const readback = orderStates.data?.orders.find((r) => r.orderId === o.orderId) ?? null
        const currentIsBid = readback?.status === 'live' ? readback.isBid : null
        return { ...o, readback, currentIsBid, flipped: currentIsBid !== null && currentIsBid !== (o.side === 'buy') }
      }),
    [tracked, orderStates.data],
  )

  // An order the DEX no longer knows is closed (cancelled elsewhere or fully taken without flipping).
  useEffect(() => {
    if (externalOrders) return
    for (const o of liveOrders) if (o.readback?.status === 'absent') closeOrder(o.orderId, 'absent')
  }, [liveOrders, externalOrders])

  const planningSnapshot = useMemo<PlanningSnapshot | null>(() => {
    if (!mandate || !book.data) return null
    const s = book.data
    const bal = balances.data
    const find = (addr: string) => bal?.tokens.find((t) => t.address.toLowerCase() === addr.toLowerCase())
    const b = find(mandate.base.address)
    const q = find(mandate.quote.address)
    const ownOrders: OwnOrderState[] = liveOrders.map((o) => {
      const r = o.readback
      if (r?.status === 'live') return { orderId: BigInt(o.orderId), isBid: r.isBid, tick: r.tick, flipTick: r.flipTick, remaining: BigInt(r.remaining), status: 'resting' }
      return { orderId: BigInt(o.orderId), isBid: o.side === 'buy', tick: o.tick, flipTick: o.flipTick, remaining: BigInt(o.amount), status: 'unknown' }
    })
    const hourAgo = (now || s.observedAt) - 3_600_000
    return {
      expectedChainId: CHAIN_ID,
      chainId: s.chainId,
      marketSupported: s.exists,
      basePaused: s.base.paused,
      quotePaused: s.quote.paused,
      bestBidTick: s.bestBidTick,
      bestAskTick: s.bestAskTick,
      blockNumber: BigInt(s.blockNumber),
      observedAtMs: s.observedAt,
      nowMs: now || s.observedAt,
      ownOrders,
      balances: b && q ? { base: { wallet: BigInt(b.wallet), dex: BigInt(b.dex) }, quote: { wallet: BigInt(q.wallet), dex: BigInt(q.dex) } } : null,
      minOrderAmount: BigInt(s.constants.minOrderAmount),
      recentActionTimestampsMs: actions.filter((a) => a.mandateId === mandate.id && a.kind === 'place' && a.txHash).map((a) => Date.parse(a.at)).filter((t) => t >= hourAgo),
    }
  }, [mandate, book.data, balances.data, liveOrders, actions, now])

  const proposal = useMemo(() => (mandate && planningSnapshot ? plan(mandate, planningSnapshot) : null), [mandate, planningSnapshot])

  const corridor = useMemo<CorridorModel | null>(() => {
    if (!mandate || !snap.data) return null
    const s = snap.data
    const best = book.data ?? s
    const orders: CorridorOrder[] = liveOrders.map((o) => {
      const r = o.readback
      if (r?.status === 'live') return { orderId: o.orderId, isBid: r.isBid, tick: r.tick, flipTick: r.flipTick, remaining: BigInt(r.remaining), state: 'resting' }
      return { orderId: o.orderId, isBid: o.side === 'buy', tick: o.tick, flipTick: o.flipTick, remaining: BigInt(o.amount), state: r ? 'unknown' : 'pending' }
    })
    const c = proposal?.candidateOrder
    return {
      from: window.from,
      to: window.to,
      targetTick: mandate.targetTick,
      bandTicks: mandate.bandTicks,
      bestBidTick: hasBestBid(best.bestBidTick) ? best.bestBidTick : null,
      bestAskTick: hasBestAsk(best.bestAskTick) ? best.bestAskTick : null,
      levels: buildLevels(s.levels, orders, window.from, window.to, s.bestBidTick, s.bestAskTick),
      orders,
      proposal: c ? { side: c.side, tick: c.tick, flipTick: c.flipTick, amount: c.amount } : null,
      coverage: proposal ? { bid: { own: proposal.coverage.bid.own, target: proposal.coverage.bid.target }, ask: { own: proposal.coverage.ask.own, target: proposal.coverage.ask.target } } : { bid: { own: 0n, target: BigInt(mandate.targetBidDepth) }, ask: { own: 0n, target: BigInt(mandate.targetAskDepth) } },
      decimals: mandate.base.decimals,
      baseSymbol: mandate.base.symbol,
      quoteSymbol: mandate.quote.symbol,
    }
  }, [mandate, snap.data, book.data, liveOrders, proposal, window])

  return {
    snapshot: snap.data,
    book: book.data,
    snapshotError: snap.error ?? book.error,
    snapshotReceivedAt: snap.receivedAt,
    balances: balances.data,
    balancesError: balances.error,
    orders: liveOrders,
    ordersBlock: orderStates.data?.blockNumber ?? null,
    ordersError: orderStates.error,
    proposal,
    planningSnapshot,
    corridor,
    window,
    now,
    signerMatches: Boolean(mandate && signer && signer.address.toLowerCase() === mandate.owner.toLowerCase()),
    refresh: () => {
      snap.refresh()
      book.refresh()
      orderStates.refresh()
      balances.refresh()
    },
  }
}

type LiveMandateInput = LiquidityMandate

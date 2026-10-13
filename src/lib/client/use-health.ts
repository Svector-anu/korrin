'use client'

import { useEffect, useMemo } from 'react'
import { assessFreshness, buildHealthReport, type Freshness } from '../health/build'
import { evaluateExceptions, type MarketException } from '../health/exceptions'
import { type Incident, updateIncidents } from '../health/incidents'
import { mandateHealthInput } from '../health/input'
import type { HealthOwnOrder, LiquidityHealthReport } from '../health/types'
import type { LiquidityMandate } from '../mandate/types'
import { CHAIN_ID, EXPLORER_URL, NETWORK_LABEL, RPC_HOST } from '../tempo/chain'
import { useNow } from './data'
import { recordHealth, useActions, useHealthHistory } from './store'
import type { MandateLive } from './use-mandate-live'

export const NETWORK_INFO = { chainId: CHAIN_ID, name: NETWORK_LABEL, environment: 'testnet' as const, explorer: EXPLORER_URL, rpcHost: RPC_HOST }

const INFLIGHT = new Set(['signing', 'submitted', 'included', 'verifying'])
const RECENT_FAILURE_MS = 30 * 60_000

export type MandateHealth = {
  report: LiquidityHealthReport | null
  previous: LiquidityHealthReport | null
  freshness: Freshness | null
  exceptions: MarketException[]
  incidents: Incident[]
  history: LiquidityHealthReport[]
}

/**
 * The canonical health report for one of the operator's markets, built from the
 * same live reads the corridor and planner use. Each new block is recorded, so
 * "what changed" and the incident log come from observations this browser made.
 */
const NO_IDS: string[] = []

export function useMandateHealth(mandate: LiquidityMandate, live: MandateLive, flipFailedOrderIds: string[] = NO_IDS): MandateHealth {
  const actions = useActions()
  const history = useHealthHistory(mandate.id)
  const now = useNow()
  const mine = useMemo(() => actions.filter((a) => a.mandateId === mandate.id), [actions, mandate.id])
  const inflight = useMemo(() => mine.filter((a) => INFLIGHT.has(a.stage)), [mine])

  const report = useMemo(() => {
    const s = live.snapshot
    if (!s && !live.snapshotError) return null
    const ownOrders: HealthOwnOrder[] = live.orders.map((o) => {
      const r = o.readback
      if (r?.status === 'live') return { orderId: o.orderId, status: 'live', isBid: r.isBid, tick: r.tick, flipTick: r.flipTick, remaining: r.remaining, placedTx: o.placedTx }
      return { orderId: o.orderId, status: r?.status === 'absent' ? 'absent' : r?.status === 'unknown' ? 'unknown' : 'pending', isBid: o.side === 'buy', tick: o.tick, flipTick: o.flipTick, remaining: o.amount, placedTx: o.placedTx }
    })
    const find = (addr: string) => live.balances?.tokens.find((t) => t.address.toLowerCase() === addr.toLowerCase())
    const b = find(mandate.base.address)
    const q = find(mandate.quote.address)
    return buildHealthReport(
      mandateHealthInput({
        network: NETWORK_INFO,
        mandate,
        source: 'ONCHAIN_READ',
        observation: s ? { blockNumber: s.blockNumber, observedAtMs: s.observedAt, bestBidTick: s.bestBidTick, bestAskTick: s.bestAskTick, levels: s.levels, tickSpacing: s.constants.tickSpacing } : null,
        observationError: live.snapshotError ?? undefined,
        ownOrders,
        balances: b && q && live.balances ? { readAtBlock: live.balances.blockNumber, base: { wallet: b.wallet, dex: b.dex }, quote: { wallet: q.wallet, dex: q.dex } } : null,
        inflightActions: inflight.length,
        proposal: live.proposal,
      }),
    )
  }, [live.snapshot, live.snapshotError, live.orders, live.balances, live.proposal, mandate, inflight.length])

  const previous = useMemo(() => history.reports.find((r) => r.reportId !== report?.reportId && r.window.block !== report?.window.block) ?? null, [history.reports, report])
  const freshness = report && now ? assessFreshness(report, now) : null

  const exceptions = useMemo(() => {
    if (!report || !freshness) return []
    return evaluateExceptions(report, {
      freshness,
      pendingActions: inflight.map((a) => ({ summary: a.summary, stage: a.stage, orderId: a.orderId })),
      failedActions: mine.filter((a) => (a.stage === 'failed' || a.stage === 'unknown') && (now === 0 || now - Date.parse(a.at) < RECENT_FAILURE_MS)).map((a) => ({ summary: a.summary, error: a.error, orderId: a.orderId })),
      flipFailedOrderIds,
      previous,
    })
  }, [report, freshness, inflight, mine, flipFailedOrderIds, previous, now])

  useEffect(() => {
    if (!report || report.quality === 'UNAVAILABLE' || !report.window.block) return
    recordHealth(mandate.id, report, (prev) => updateIncidents(prev, exceptions, { reportId: report.reportId, block: report.window.block, iso: report.window.observedAt ?? new Date().toISOString() }))
  }, [report, exceptions, mandate.id])

  return { report, previous, freshness, exceptions, incidents: history.incidents, history: history.reports }
}

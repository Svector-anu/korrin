'use client'

import { useSyncExternalStore } from 'react'
import type { Address, Hex } from 'viem'
import type { Incident } from '../health/incidents'
import type { LiquidityHealthReport } from '../health/types'
import type { LiquidityMandate } from '../mandate/types'

export type SignerRecord = { address: Address; privateKey: Hex; createdAt: string }

export type TrackedOrder = {
  chainId: number
  orderId: string
  mandateId: string
  base: Address
  side: 'buy' | 'sell'
  tick: number
  flipTick: number
  amount: string
  placedTx: Hex
  placedBlock: string
  placedAt: string
  closedAt?: string
  closeReason?: 'cancelled' | 'absent'
}

export type ActionKind = 'create' | 'place' | 'cancel' | 'withdraw' | 'faucet' | 'pause' | 'resume' | 'policy' | 'close'
export type ActionStage = 'signing' | 'submitted' | 'included' | 'verifying' | 'confirmed' | 'failed' | 'unknown' | 'recorded'

export type ActionRecord = {
  id: string
  mandateId?: string
  kind: ActionKind
  at: string
  stage: ActionStage
  summary: string
  txHash?: Hex
  block?: string
  orderId?: string
  readback?: string
  error?: string
  reasonCode?: string
}

/** Report history and incident log per market, rebuilt from real reads in this browser. */
export type HealthHistory = { reports: LiquidityHealthReport[]; incidents: Incident[] }

type KorrinState = {
  version: 1
  signer: SignerRecord | null
  mandates: LiquidityMandate[]
  orders: TrackedOrder[]
  actions: ActionRecord[]
  health: Record<string, HealthHistory>
}

const KEY = 'korrin:state:v1'
const EMPTY: KorrinState = { version: 1, signer: null, mandates: [], orders: [], actions: [], health: {} }

let state: KorrinState = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) state = { ...EMPTY, ...(JSON.parse(raw) as KorrinState) }
  } catch {
    state = EMPTY
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    try {
      state = { ...EMPTY, ...(JSON.parse(e.newValue) as KorrinState) }
      listeners.forEach((l) => l())
    } catch {
      // Ignore a malformed write from another tab; this tab keeps its last good state.
    }
  })
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Quota or privacy mode: state stays in memory for this session.
  }
}

export function update(mutator: (draft: KorrinState) => KorrinState): void {
  load()
  state = mutator(state)
  persist()
  listeners.forEach((l) => l())
}

export function getState(): KorrinState {
  load()
  return state
}

function subscribe(listener: () => void) {
  load()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useKorrin<T>(selector: (s: KorrinState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(EMPTY),
  )
}

/** True after hydration, so pages can tell "nothing stored" from "not read yet". */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

export function recordAction(action: Omit<ActionRecord, 'id' | 'at'> & { id?: string; at?: string }): string {
  const id = action.id ?? newId()
  update((s) => ({ ...s, actions: [{ ...action, id, at: action.at ?? new Date().toISOString() }, ...s.actions].slice(0, 500) }))
  return id
}

export function patchAction(id: string, patch: Partial<ActionRecord>): void {
  update((s) => ({ ...s, actions: s.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
}

export function upsertMandate(m: LiquidityMandate): void {
  update((s) => ({ ...s, mandates: [m, ...s.mandates.filter((x) => x.id !== m.id)] }))
}

export function patchMandate(id: string, patch: Partial<LiquidityMandate>): void {
  update((s) => ({ ...s, mandates: s.mandates.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)) }))
}

export function trackOrder(order: TrackedOrder): void {
  update((s) => ({ ...s, orders: [order, ...s.orders.filter((o) => !(o.chainId === order.chainId && o.orderId === order.orderId))] }))
}

export function closeOrder(orderId: string, reason: TrackedOrder['closeReason']): void {
  update((s) => ({ ...s, orders: s.orders.map((o) => (o.orderId === orderId && !o.closedAt ? { ...o, closedAt: new Date().toISOString(), closeReason: reason } : o)) }))
}

export function setSigner(signer: SignerRecord | null): void {
  update((s) => ({ ...s, signer }))
}

// Selectors must return stored references (never freshly built arrays), or
// useSyncExternalStore will loop. Derive filtered views with useMemo instead.
const REPORT_HISTORY = 24

/** Appends a report once per block and folds its exceptions into the incident log. */
export function recordHealth(mandateId: string, report: LiquidityHealthReport, incidents: (prev: Incident[]) => Incident[]): void {
  if (getState().health[mandateId]?.reports.some((r) => r.reportId === report.reportId)) return
  update((s) => {
    const current = s.health[mandateId] ?? { reports: [], incidents: [] }
    if (current.reports.some((r) => r.reportId === report.reportId)) return s
    const reports = [report, ...current.reports.filter((r) => r.window.block !== report.window.block)].slice(0, REPORT_HISTORY)
    return { ...s, health: { ...s.health, [mandateId]: { reports, incidents: incidents(current.incidents) } } }
  })
}

const NO_HISTORY: HealthHistory = { reports: [], incidents: [] }
export const useHealthHistory = (mandateId: string) => useKorrin((s) => s.health[mandateId] ?? NO_HISTORY)

export const useSigner = () => useKorrin((s) => s.signer)
export const useMandates = () => useKorrin((s) => s.mandates)
export const useOrders = () => useKorrin((s) => s.orders)
export const useActions = () => useKorrin((s) => s.actions)

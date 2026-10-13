import type { ExceptionCode, MarketException, Severity } from './exceptions'

/** One continuous exception, opened when first seen and resolved when a later report no longer shows it (PRD v2 §6.2). */
export type Incident = {
  id: string
  code: ExceptionCode
  severity: Severity
  title: string
  explanation: string
  recovery: string
  orderIds: string[]
  openedAt: string
  openedBlock: string | null
  firstReportId: string
  updatedAt: string
  lastBlock: string | null
  lastReportId: string
  observations: number
  resolvedAt: string | null
  resolvedBlock: string | null
}

/** Informational codes are events, not incidents. */
const NOT_INCIDENTS: ReadonlySet<ExceptionCode> = new Set(['COVERAGE_RESTORED'])

const keyOf = (code: string, orderIds: readonly string[] = []) => `${code}:${[...orderIds].sort().join(',')}`

/**
 * Folds one evaluation into the incident log. Pure: returns a new list and never
 * mutates its input. Incidents keep their first-seen time across observations.
 */
export function updateIncidents(incidents: readonly Incident[], exceptions: readonly MarketException[], at: { reportId: string; block: string | null; iso: string }, limit = 100): Incident[] {
  const current = exceptions.filter((e) => !NOT_INCIDENTS.has(e.code))
  const seen = new Set(current.map((e) => keyOf(e.code, e.orderIds)))
  const next = incidents.map((i) => {
    if (i.resolvedAt) return i
    if (seen.has(keyOf(i.code, i.orderIds))) return i
    return { ...i, resolvedAt: at.iso, resolvedBlock: at.block }
  })
  for (const e of current) {
    const key = keyOf(e.code, e.orderIds)
    const index = next.findIndex((i) => !i.resolvedAt && keyOf(i.code, i.orderIds) === key)
    if (index >= 0) {
      const i = next[index]
      next[index] = { ...i, title: e.title, explanation: e.explanation, recovery: e.recovery, severity: e.severity, updatedAt: at.iso, lastBlock: at.block, lastReportId: at.reportId, observations: i.observations + 1 }
    } else {
      next.push({
        id: `inc_${at.reportId.slice(4, 14)}_${e.code.toLowerCase()}`,
        code: e.code,
        severity: e.severity,
        title: e.title,
        explanation: e.explanation,
        recovery: e.recovery,
        orderIds: [...(e.orderIds ?? [])].sort(),
        openedAt: at.iso,
        openedBlock: at.block,
        firstReportId: at.reportId,
        updatedAt: at.iso,
        lastBlock: at.block,
        lastReportId: at.reportId,
        observations: 1,
        resolvedAt: null,
        resolvedBlock: null,
      })
    }
  }
  const open = next.filter((i) => !i.resolvedAt)
  const resolved = next.filter((i) => i.resolvedAt).sort((a, b) => Date.parse(b.resolvedAt ?? '') - Date.parse(a.resolvedAt ?? ''))
  return [...open, ...resolved].slice(0, limit)
}

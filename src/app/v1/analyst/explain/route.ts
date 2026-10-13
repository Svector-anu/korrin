import { classifyQuestion, deterministicAnswer } from '@/lib/analyst/deterministic'
import { modelAnswer } from '@/lib/analyst/model'
import type { AnalystContext, AnalystIntent } from '@/lib/analyst/types'
import { fromWirePlanning, type WirePlanning } from '@/lib/analyst/wire'
import { assessFreshness, verifyReportDigest } from '@/lib/health/build'
import type { MarketException } from '@/lib/health/exceptions'
import type { Incident } from '@/lib/health/incidents'
import { type PolicyOverrides, simulatePolicyChange } from '@/lib/health/simulate'
import type { LiquidityHealthReport } from '@/lib/health/types'
import type { LiquidityMandate } from '@/lib/mandate/types'
import { apiError, apiJson, rateLimit, rateLimited, traceId } from '@/lib/server/api'

const INTENTS: readonly AnalystIntent[] = ['explain_state', 'explain_shortfall', 'what_changed', 'why_waiting', 'inventory', 'what_if', 'incident_summary', 'draft_proposal']
const MAX_BODY = 400_000

type Body = {
  intent?: AnalystIntent
  question?: string
  useModel?: boolean
  context?: {
    report?: LiquidityHealthReport
    previous?: LiquidityHealthReport | null
    exceptions?: MarketException[]
    incidents?: Incident[]
    policy?: LiquidityMandate | null
    planning?: WirePlanning | null
    overrides?: PolicyOverrides | null
  }
}

/**
 * Read-only analyst (PRD v2 §7). It receives a frozen report and derived context,
 * recomputes anything it can (digest, freshness, simulation) and has no tool that
 * reaches a wallet, a signer or the chain.
 */
export async function POST(request: Request) {
  const trace = traceId()
  const limit = await rateLimit(request, 'analyst', 20)
  if (!limit.ok) return rateLimited(limit.resetSeconds, trace)
  const raw = await request.text()
  if (raw.length > MAX_BODY) return apiError('INVALID_INPUT', 'The request is too large.', { trace })
  let body: Body
  try {
    body = JSON.parse(raw) as Body
  } catch {
    return apiError('INVALID_INPUT', 'The body must be JSON.', { trace })
  }
  const c = body.context
  if (!c?.report) return apiError('INVALID_INPUT', 'context.report is required.', { trace })
  if (!verifyReportDigest(c.report) || (c.previous && !verifyReportDigest(c.previous))) return apiError('INVALID_INPUT', 'A report does not match its digest, so it was altered after it was built.', { trace })
  const question = typeof body.question === 'string' ? body.question.slice(0, 500) : null
  const intent: AnalystIntent = body.intent && INTENTS.includes(body.intent) ? body.intent : question ? classifyQuestion(question) : 'explain_state'

  let policy: LiquidityMandate | null = null
  let planning = null
  try {
    planning = c.planning ? fromWirePlanning(c.planning) : null
    policy = c.policy && c.report.mandate && c.policy.id === c.report.mandate.id ? c.policy : null
  } catch {
    return apiError('INVALID_INPUT', 'context.planning is malformed.', { trace })
  }
  const simulation = policy && planning && c.overrides ? simulatePolicyChange(policy, planning, c.overrides) : null

  const ctx: AnalystContext = {
    report: c.report,
    previous: c.previous ?? null,
    exceptions: Array.isArray(c.exceptions) ? c.exceptions.slice(0, 30) : [],
    incidents: Array.isArray(c.incidents) ? c.incidents.slice(0, 50) : [],
    simulation,
    ageSeconds: assessFreshness(c.report, Date.now()).ageSeconds,
  }
  const det = deterministicAnswer(intent, ctx, policy, planning)
  const answer = body.useModel === false ? det : await modelAnswer(intent, question, ctx, det)
  return apiJson({ answer, verified: det, traceId: trace }, { trace })
}

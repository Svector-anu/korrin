import type { MarketException } from '../health/exceptions'
import type { Incident } from '../health/incidents'
import type { PolicyOverrides, SimulationResult } from '../health/simulate'
import type { LiquidityHealthReport } from '../health/types'

export const ANALYST_ENGINE_VERSION = 'korrin-analyst/1.0.0'

export type AnalystIntent = 'explain_state' | 'explain_shortfall' | 'what_changed' | 'why_waiting' | 'inventory' | 'what_if' | 'incident_summary' | 'draft_proposal'

export const CURATED_PROMPTS: { intent: AnalystIntent; label: string }[] = [
  { intent: 'explain_shortfall', label: 'Why is coverage short?' },
  { intent: 'what_changed', label: 'What changed since the last report?' },
  { intent: 'why_waiting', label: 'Why is Korrin waiting?' },
  { intent: 'inventory', label: 'Where are my funds?' },
  { intent: 'incident_summary', label: 'Summarize the incidents' },
  { intent: 'draft_proposal', label: 'Draft a plan that closes the gap' },
]

/** One claim, tied to the report fields it came from (PRD v2 §7.2). */
export type Finding = { statement: string; evidencePaths: string[]; confidence: 'verified' | 'qualified' }

export type AnalystAnswer = {
  kind: 'explanation' | 'comparison' | 'scenario' | 'incident' | 'proposal_draft'
  intent: AnalystIntent
  headline: string
  explanation: string
  findings: Finding[]
  caveats: string[]
  action: { type: 'NONE' | 'OPEN_REVIEW' | 'APPLY_TO_DRAFT'; draft?: PolicyOverrides }
  sourceReportIds: string[]
  engineVersion: string
  wasSimulated: boolean
  /** 'deterministic' answers come from code only. 'model' answers were written by an LLM and passed validation. */
  author: 'deterministic' | 'model'
  /** Why the model's answer was not used, when it was attempted and rejected. */
  fallbackReason?: string
}

/** The frozen context an answer is built from. Nothing outside it may be cited. */
export type AnalystContext = {
  report: LiquidityHealthReport
  previous: LiquidityHealthReport | null
  exceptions: MarketException[]
  incidents: Incident[]
  simulation: SimulationResult | null
  ageSeconds: number | null
}

import { compareReports } from '../health/compare'
import { type PolicyOverrides, simulatePolicyChange } from '../health/simulate'
import type { LiquidityHealthReport, Metric } from '../health/types'
import type { LiquidityMandate } from '../mandate/types'
import type { PlanningSnapshot } from '../policy/plan'
import { formatAmount } from '../units'
import { ANALYST_ENGINE_VERSION, type AnalystAnswer, type AnalystContext, type AnalystIntent, type Finding } from './types'

const amount = (r: LiquidityHealthReport, v: string | null | undefined) => (v === null || v === undefined ? 'unknown' : `${formatAmount(BigInt(v), r.market.decimals)} ${r.market.base}`)
const metric = (r: LiquidityHealthReport, m: Metric | undefined) => (m ? (m.value === null ? `unknown (${m.reasonIfNull ?? 'not observed'})` : amount(r, m.value)) : 'not applicable')
const pct = (ratio: number | null | undefined) => (ratio === null || ratio === undefined ? 'unknown' : `${Math.round(ratio * 100)}%`)

function base(ctx: AnalystContext, intent: AnalystIntent, kind: AnalystAnswer['kind']): Omit<AnalystAnswer, 'headline' | 'explanation' | 'findings'> {
  const caveats: string[] = []
  if (ctx.report.quality !== 'HIGH') caveats.push(`Report quality is ${ctx.report.quality}: ${ctx.report.qualityReasons.join(' ')}`)
  if (ctx.ageSeconds !== null && ctx.ageSeconds > ctx.report.window.maxAllowedAgeSeconds) caveats.push(`The report is ${ctx.ageSeconds}s old, past the ${ctx.report.window.maxAllowedAgeSeconds}s freshness limit.`)
  if (ctx.report.window.source === 'RECORDED_REPLAY') caveats.push('This is a recorded replay, not a live observation.')
  return { kind, intent, caveats, action: { type: 'NONE' }, sourceReportIds: [ctx.report.reportId, ...(ctx.previous ? [ctx.previous.reportId] : [])], engineVersion: ANALYST_ENGINE_VERSION, wasSimulated: false, author: 'deterministic' }
}

function explainState(ctx: AnalystContext): AnalystAnswer {
  const r = ctx.report
  const m = r.mandate
  const findings: Finding[] = [
    { statement: `At block ${r.window.block}, bids in the ${r.methodology.band.halfWidthBps} bp band total ${metric(r, r.depth.totalBid)} and asks total ${metric(r, r.depth.totalAsk)}.`, evidencePaths: ['depth.totalBid', 'depth.totalAsk', 'window.block'], confidence: r.depth.totalBid.value !== null && r.depth.totalAsk.value !== null ? 'verified' : 'qualified' },
  ]
  if (m) {
    findings.push({ statement: `Your verified orders provide ${metric(r, r.depth.ownBid)} on the bid (${pct(m.coverageBid.ratio)} of target) and ${metric(r, r.depth.ownAsk)} on the ask (${pct(m.coverageAsk.ratio)} of target).`, evidencePaths: ['depth.ownBid', 'depth.ownAsk', 'mandate.coverageBid', 'mandate.coverageAsk'], confidence: m.coverageBid.status === 'UNKNOWN' || m.coverageAsk.status === 'UNKNOWN' ? 'qualified' : 'verified' })
    if (m.decision) findings.push({ statement: `Next step: ${m.decision.action}`, evidencePaths: ['mandate.decision.kind', 'mandate.decision.action'], confidence: 'verified' })
  }
  if (ctx.exceptions.length) findings.push({ statement: `${ctx.exceptions.length} exception(s) are open, led by: ${ctx.exceptions[0].title}.`, evidencePaths: ctx.exceptions[0].evidencePaths, confidence: 'verified' })
  return { ...base(ctx, 'explain_state', 'explanation'), headline: `${r.market.base}/${r.market.quote}: ${r.quality === 'HIGH' ? 'complete read' : r.quality.toLowerCase() + ' read'} at block ${r.window.block}`, explanation: findings.map((f) => f.statement).join(' '), findings }
}

function explainShortfall(ctx: AnalystContext): AnalystAnswer {
  const r = ctx.report
  const m = r.mandate
  if (!m) return { ...base(ctx, 'explain_shortfall', 'explanation'), headline: 'No target is in scope for this report', explanation: 'Coverage is measured against a plan. This report has no plan attached, so there is no shortfall to explain.', findings: [] }
  const sides = (['bid', 'ask'] as const).map((side) => {
    const cov = side === 'bid' ? m.coverageBid : m.coverageAsk
    const gap = side === 'bid' ? m.shortfallBid : m.shortfallAsk
    const own = side === 'bid' ? r.depth.ownBid : r.depth.ownAsk
    const target = side === 'bid' ? m.targetBid : m.targetAsk
    return { side, cov, gap, own, target }
  })
  const short = sides.filter((s) => s.cov.status === 'SHORT')
  const unknown = sides.filter((s) => s.cov.status === 'UNKNOWN')
  const findings: Finding[] = sides.map((s) => ({
    statement: s.cov.status === 'NOT_APPLICABLE' ? `The plan sets no ${s.side} target.` : s.cov.status === 'UNKNOWN' ? `${s.side === 'bid' ? 'Bid' : 'Ask'} coverage is unknown: ${s.cov.reasonIfNull}` : `${s.side === 'bid' ? 'Bid' : 'Ask'}: ${metric(r, s.own)} verified of a ${amount(r, s.target)} target (${pct(s.cov.ratio)}), gap ${metric(r, s.gap)}.`,
    evidencePaths: [`mandate.coverage${s.side === 'bid' ? 'Bid' : 'Ask'}`, `mandate.shortfall${s.side === 'bid' ? 'Bid' : 'Ask'}`, `depth.own${s.side === 'bid' ? 'Bid' : 'Ask'}`],
    confidence: s.cov.status === 'UNKNOWN' ? 'qualified' : 'verified',
  }))
  if (m.decision) findings.push({ statement: m.decision.kind.startsWith('PLACE') ? `Korrin proposes: ${m.decision.action}` : `Korrin is not proposing an order: ${m.decision.cause}`, evidencePaths: ['mandate.decision.kind', 'mandate.decision.cause', 'mandate.decision.action'], confidence: 'verified' })
  const headline = unknown.length ? 'Coverage can’t be fully measured right now' : short.length === 0 ? 'Both sides meet their targets' : `${short.map((s) => (s.side === 'bid' ? 'Bid' : 'Ask')).join(' and ')} side${short.length > 1 ? 's are' : ' is'} short of target`
  const explanation = unknown.length
    ? `At least one order could not be confirmed, so its liquidity is excluded rather than assumed. ${findings.map((f) => f.statement).join(' ')}`
    : short.length === 0
      ? 'Verified resting depth meets the plan on every side with a target.'
      : `Only orders read back from the DEX inside your range count. ${findings.map((f) => f.statement).join(' ')}`
  return { ...base(ctx, 'explain_shortfall', 'explanation'), headline, explanation, findings, action: m.decision?.kind.startsWith('PLACE') ? { type: 'OPEN_REVIEW' } : { type: 'NONE' } }
}

function whatChanged(ctx: AnalystContext): AnalystAnswer {
  const r = ctx.report
  if (!ctx.previous) return { ...base(ctx, 'what_changed', 'comparison'), headline: 'There is no earlier report to compare yet', explanation: 'Korrin compares reports this browser recorded. Leave the market open for a few blocks and ask again.', findings: [] }
  const diff = compareReports(ctx.previous, r)
  if (!diff.compatible) return { ...base(ctx, 'what_changed', 'comparison'), headline: 'These reports can’t be compared', explanation: diff.reason ?? 'They measure different things.', findings: [] }
  const findings: Finding[] = diff.changes.map((c) => {
    const show = (v: string | null) => (v === null ? 'unknown' : c.kind === 'amount' ? amount(r, v) : v)
    const delta = c.delta ? ` (${BigInt(c.delta) >= 0n ? '+' : '−'}${formatAmount(BigInt(c.delta) < 0n ? -BigInt(c.delta) : BigInt(c.delta), r.market.decimals)} ${r.market.base})` : ''
    return { statement: `${c.label}: ${show(c.before)} → ${show(c.after)}${delta}.`, evidencePaths: [c.path], confidence: c.before === null || c.after === null ? 'qualified' : 'verified' }
  })
  return {
    ...base(ctx, 'what_changed', 'comparison'),
    headline: findings.length ? `${findings.length} change${findings.length > 1 ? 's' : ''} between block ${ctx.previous.window.block} and ${r.window.block}` : `Nothing measured changed between block ${ctx.previous.window.block} and ${r.window.block}`,
    explanation: findings.length ? findings.map((f) => f.statement).join(' ') : 'Depth, prices, coverage and your orders read the same in both reports.',
    findings,
  }
}

function whyWaiting(ctx: AnalystContext): AnalystAnswer {
  const r = ctx.report
  const d = r.mandate?.decision
  if (!d) return { ...base(ctx, 'why_waiting', 'explanation'), headline: 'No decision is attached to this report', explanation: 'Decisions come from the planner for one of your markets. Public reports carry none.', findings: [] }
  const blocking = ctx.exceptions.filter((e) => e.blocksNewOrders)
  const findings: Finding[] = [
    { statement: `Korrin sees: ${d.cause}`, evidencePaths: ['mandate.decision.cause'], confidence: 'verified' },
    { statement: `Decision ${d.kind} (${d.reasonCode}): ${d.action}`, evidencePaths: ['mandate.decision.kind', 'mandate.decision.reasonCode'], confidence: 'verified' },
    ...(d.nextCondition ? [{ statement: `It changes when: ${d.nextCondition}`, evidencePaths: ['mandate.decision.nextCondition'], confidence: 'verified' as const }] : []),
    ...blocking.map((e) => ({ statement: `${e.title}. ${e.recovery}`, evidencePaths: e.evidencePaths, confidence: 'verified' as const })),
  ]
  const placing = d.kind === 'PLACE_BID' || d.kind === 'PLACE_ASK'
  return { ...base(ctx, 'why_waiting', 'explanation'), headline: placing ? 'Korrin isn’t waiting: an order is ready for your review' : `Korrin is holding: ${d.reasonCode.replaceAll('_', ' ')}`, explanation: findings.map((f) => f.statement).join(' '), findings, action: placing ? { type: 'OPEN_REVIEW' } : { type: 'NONE' } }
}

function inventory(ctx: AnalystContext): AnalystAnswer {
  const r = ctx.report
  const inv = r.inventory
  if (!inv) return { ...base(ctx, 'inventory', 'explanation'), headline: 'Balances aren’t in this report', explanation: r.mandate ? 'Wallet and DEX balances could not be read for this report.' : 'Public reports never include anyone’s balances.', findings: [] }
  const fmt = (v: string, sym: string) => `${formatAmount(BigInt(v), r.market.decimals)} ${sym}`
  const findings: Finding[] = (['quote', 'base'] as const).map((t) => {
    const b = inv[t]
    const sym = t === 'quote' ? r.market.quote : r.market.base
    return {
      statement: `${sym}: ${fmt(b.committedResting, sym)} on the book, ${fmt(b.idleWallet, sym)} free in the wallet, ${fmt(b.dexInternalFree, sym)} in the DEX balance, ${fmt(b.reservedPolicy, sym)} kept in reserve${BigInt(b.unreconciled) > 0n ? `, ${fmt(b.unreconciled, sym)} unconfirmed` : ''}.`,
      evidencePaths: [`inventory.${t}.committedResting`, `inventory.${t}.idleWallet`, `inventory.${t}.dexInternalFree`, `inventory.${t}.reservedPolicy`],
      confidence: 'verified',
    }
  })
  const idle = (['quote', 'base'] as const).filter((t) => BigInt(inv[t].dexInternalFree) > 0n)
  if (idle.length) findings.push({ statement: `Funds in the DEX balance aren’t quoting. Withdraw them to use them again.`, evidencePaths: idle.map((t) => `inventory.${t}.dexInternalFree`), confidence: 'verified' })
  return { ...base(ctx, 'inventory', 'explanation'), headline: 'Where your funds are, at block ' + inv.readAtBlock, explanation: `The buckets don’t overlap: escrow on the book has already left the wallet, and the reserve is carved out of what you hold. ${findings.map((f) => f.statement).join(' ')}`, findings }
}

function incidentSummary(ctx: AnalystContext): AnalystAnswer {
  const open = ctx.incidents.filter((i) => !i.resolvedAt)
  const resolved = ctx.incidents.filter((i) => i.resolvedAt)
  const findings: Finding[] = [...open, ...resolved].slice(0, 8).map((i) => ({
    statement: `${i.resolvedAt ? 'Resolved' : 'Open'}: ${i.title}. First seen at block ${i.openedBlock ?? '?'}${i.resolvedAt ? `, cleared at block ${i.resolvedBlock ?? '?'}` : `, still present at block ${i.lastBlock ?? '?'}`} across ${i.observations} report(s).`,
    evidencePaths: [`incidents.${i.id}`],
    confidence: 'verified',
  }))
  return {
    ...base(ctx, 'incident_summary', 'incident'),
    headline: ctx.incidents.length ? `${open.length} open, ${resolved.length} resolved` : 'No incidents recorded',
    explanation: ctx.incidents.length ? `The log is built from reports this browser recorded, so gaps between visits are unknown, not quiet. ${findings.map((f) => f.statement).join(' ')}` : 'Nothing has gone wrong in the reports recorded so far.',
    findings,
    caveats: [...base(ctx, 'incident_summary', 'incident').caveats, 'Incidents only cover periods when this market was open in a browser.'],
  }
}

function whatIf(ctx: AnalystContext): AnalystAnswer {
  const sim = ctx.simulation
  const r = ctx.report
  if (!sim) return { ...base(ctx, 'what_if', 'scenario'), headline: 'Run a what-if first', explanation: 'Change a target or limit in the What if panel and run it. The analyst explains that exact result.', findings: [] }
  if (!sim.ok) return { ...base(ctx, 'what_if', 'scenario'), wasSimulated: true, headline: 'That change isn’t valid', explanation: sim.errors.join(' '), findings: sim.errors.map((e) => ({ statement: e, evidencePaths: ['simulation.errors'], confidence: 'verified' })) }
  const findings: Finding[] = [
    { statement: `Bid gap ${amount(r, sim.before.shortfallBid)} → ${amount(r, sim.after.shortfallBid)}; ask gap ${amount(r, sim.before.shortfallAsk)} → ${amount(r, sim.after.shortfallAsk)}.`, evidencePaths: ['simulation.before.shortfallBid', 'simulation.after.shortfallBid', 'simulation.before.shortfallAsk', 'simulation.after.shortfallAsk'], confidence: 'verified' },
    { statement: `To close both gaps you would need ${formatAmount(BigInt(sim.after.funding.quoteNeeded), r.market.decimals)} ${r.market.quote} and ${formatAmount(BigInt(sim.after.funding.baseNeeded), r.market.decimals)} ${r.market.base}; free inside the allocation: ${sim.after.funding.quoteAvailable === null ? 'unknown' : formatAmount(BigInt(sim.after.funding.quoteAvailable), r.market.decimals)} ${r.market.quote} and ${sim.after.funding.baseAvailable === null ? 'unknown' : formatAmount(BigInt(sim.after.funding.baseAvailable), r.market.decimals)} ${r.market.base}.`, evidencePaths: ['simulation.after.funding'], confidence: sim.after.funding.quoteAvailable === null ? 'qualified' : 'verified' },
    { statement: `Next step with the change: ${sim.after.action}`, evidencePaths: ['simulation.after.kind', 'simulation.after.action'], confidence: 'verified' },
  ]
  return { ...base(ctx, 'what_if', 'scenario'), wasSimulated: true, headline: `With ${sim.changedFields.join(', ') || 'no changes'}: ${sim.after.kind === sim.before.kind ? 'same next step' : `${sim.before.kind} becomes ${sim.after.kind}`}`, explanation: `Simulated against block ${sim.observationBlock}. Nothing was saved. ${findings.map((f) => f.statement).join(' ')}`, findings }
}

/**
 * Proposes the smallest plan edit, found by the simulator, that lets the planner
 * place an order again when it is blocked on funds. Draft only; never applied.
 */
export function draftProposal(ctx: AnalystContext, policy: LiquidityMandate | null, planning: PlanningSnapshot | null): AnalystAnswer {
  const r = ctx.report
  const d = r.mandate?.decision
  const head = base(ctx, 'draft_proposal', 'proposal_draft')
  if (!d || !policy || !planning) return { ...head, headline: 'Nothing to draft', explanation: 'Drafts need your plan and a fresh read of the book.', findings: [] }
  if (d.kind === 'PLACE_BID' || d.kind === 'PLACE_ASK') return { ...head, headline: 'No plan change needed', explanation: `The planner can already act within your limits: ${d.action}`, findings: [{ statement: d.action, evidencePaths: ['mandate.decision.action'], confidence: 'verified' }], action: { type: 'OPEN_REVIEW' } }
  if (d.kind === 'KEEP') return { ...head, headline: 'Your targets are met', explanation: 'Both sides meet their targets, so no change is suggested.', findings: [] }
  if (d.reasonCode !== 'insufficient_free_inventory') return { ...head, headline: 'A plan change won’t fix this', explanation: `Korrin is waiting because: ${d.cause} That isn’t something a different target solves.`, findings: [{ statement: d.cause, evidencePaths: ['mandate.decision.cause'], confidence: 'verified' }] }

  const candidates: PolicyOverrides[] = [{ reserveQuote: '0', reserveBase: '0' }]
  for (const side of ['bid', 'ask'] as const) {
    const own = BigInt((side === 'bid' ? r.depth.ownBid.value : r.depth.ownAsk.value) ?? '0')
    const step = 10n * 10n ** BigInt(r.market.decimals)
    const target = BigInt(side === 'bid' ? policy.targetBidDepth : policy.targetAskDepth)
    for (let t = target - step; t > own; t -= step) candidates.push(side === 'bid' ? { targetBidDepth: t.toString() } : { targetAskDepth: t.toString() })
  }
  for (const overrides of candidates) {
    const sim = simulatePolicyChange(policy, planning, overrides)
    if (sim.ok && (sim.after.kind === 'PLACE_BID' || sim.after.kind === 'PLACE_ASK')) {
      return {
        ...head,
        wasSimulated: true,
        headline: 'A draft that lets Korrin place the next order',
        explanation: `Simulated against block ${sim.observationBlock}: changing ${sim.changedFields.join(', ')} lets the planner propose "${sim.after.action}" Review it in What if before saving a new plan version.`,
        findings: [{ statement: `With this draft the next step becomes ${sim.after.kind}.`, evidencePaths: ['simulation.after.kind'], confidence: 'verified' }],
        action: { type: 'APPLY_TO_DRAFT', draft: overrides },
      }
    }
  }
  return { ...head, wasSimulated: true, headline: 'No smaller plan closes the gap', explanation: 'Even without a reserve or with smaller targets, there aren’t enough free funds for the DEX minimum order. Add funds or withdraw your DEX balance.', findings: [{ statement: d.cause, evidencePaths: ['mandate.decision.cause'], confidence: 'verified' }] }
}

export function deterministicAnswer(intent: AnalystIntent, ctx: AnalystContext, policy: LiquidityMandate | null = null, planning: PlanningSnapshot | null = null): AnalystAnswer {
  switch (intent) {
    case 'explain_shortfall':
      return explainShortfall(ctx)
    case 'what_changed':
      return whatChanged(ctx)
    case 'why_waiting':
      return whyWaiting(ctx)
    case 'inventory':
      return inventory(ctx)
    case 'what_if':
      return whatIf(ctx)
    case 'incident_summary':
      return incidentSummary(ctx)
    case 'draft_proposal':
      return draftProposal(ctx, policy, planning)
    default:
      return explainState(ctx)
  }
}

/** Picks a curated intent for a free-text question when no model is available. */
export function classifyQuestion(question: string): AnalystIntent {
  const q = question.toLowerCase()
  if (/chang|differ|since|before/.test(q)) return 'what_changed'
  if (/fund|balance|inventory|money|where/.test(q)) return 'inventory'
  if (/incident|went wrong|error|problem|timeline/.test(q)) return 'incident_summary'
  if (/what if|increase|decrease|raise|lower|more|less/.test(q)) return 'what_if'
  if (/draft|propos|fix|close the gap/.test(q)) return 'draft_proposal'
  if (/wait|hold|block|why not|stuck/.test(q)) return 'why_waiting'
  if (/short|gap|coverage|low|depth/.test(q)) return 'explain_shortfall'
  return 'explain_state'
}

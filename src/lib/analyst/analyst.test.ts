import { describe, expect, it } from 'vitest'
import { assessFreshness, buildHealthReport } from '../health/build'
import { evaluateExceptions } from '../health/exceptions'
import { input, mandate, NOW, observation, own, planningSnapshot, U } from '../health/test-fixtures'
import { plan } from '../policy/plan'
import { classifyQuestion, deterministicAnswer } from './deterministic'
import { validateModelOutput } from './model'
import type { AnalystContext } from './types'

function context(o: Partial<Parameters<typeof input>[0]> = {}, previous: AnalystContext['previous'] = null): AnalystContext {
  const report = buildHealthReport(input(o))
  return { report, previous, exceptions: evaluateExceptions(report, { freshness: assessFreshness(report, NOW) }), incidents: [], simulation: null, ageSeconds: 2 }
}

describe('deterministicAnswer', () => {
  it('explains a shortfall with the report’s exact figures', () => {
    // #given 250 of a 500 bid target verified
    const answer = deterministicAnswer('explain_shortfall', context())
    // #then the bid finding carries those numbers and cites the coverage fields
    expect(answer.findings[0]).toEqual({ statement: 'Bid: 250.00 BetaUSD verified of a 500.00 BetaUSD target (50%), gap 250.00 BetaUSD.', evidencePaths: ['mandate.coverageBid', 'mandate.shortfallBid', 'depth.ownBid'], confidence: 'verified' })
  })

  it('says coverage is unknown instead of guessing when an order is unconfirmed', () => {
    const answer = deterministicAnswer('explain_shortfall', context({ ownOrders: [own({ status: 'unknown' })] }))
    expect(answer.headline).toBe('Coverage can’t be fully measured right now')
  })

  it('reports the change in own depth between two reports', () => {
    const previous = buildHealthReport(input())
    const answer = deterministicAnswer('what_changed', context({ observation: observation({ blockNumber: '39243800' }), ownOrders: [own({ remaining: (100n * U).toString() })] }, previous))
    expect(answer.findings.find((f) => f.evidencePaths.includes('depth.ownBid'))?.statement).toBe('Your bids in the band: 250.00 BetaUSD → 100.00 BetaUSD (−150.00 BetaUSD).')
  })

  it('names stale data as a caveat', () => {
    const c = context()
    const answer = deterministicAnswer('explain_state', { ...c, ageSeconds: 120 })
    expect(answer.caveats).toContain('The report is 120s old, past the 30s freshness limit.')
  })

  it('drafts a smaller target when funds run out, without touching the saved plan', () => {
    // #given a wallet too thin for the next bid
    const m = mandate()
    const before = JSON.stringify(m)
    const snap = { ...planningSnapshot(m, [own()]), balances: { base: { wallet: 150n * U, dex: 0n }, quote: { wallet: 150n * U, dex: 0n } } }
    const proposal = plan(m, snap)
    const c = context({ mandate: m, proposal, balances: { readAtBlock: '39243765', base: { wallet: (150n * U).toString(), dex: '0' }, quote: { wallet: (150n * U).toString(), dex: '0' } } })
    // #when the analyst drafts a plan
    const answer = deterministicAnswer('draft_proposal', c, m, snap)
    // #then it returns a draft for review and the plan object is unchanged
    expect({ action: answer.action.type, unchanged: JSON.stringify(m) === before, reason: proposal.reasonCode }).toEqual({ action: 'APPLY_TO_DRAFT', unchanged: true, reason: 'insufficient_free_inventory' })
  })
})

describe('validateModelOutput', () => {
  const det = deterministicAnswer('explain_shortfall', context())
  const facts = JSON.stringify({ findings: det.findings, explanation: det.explanation })

  it('accepts a rephrasing that only reuses known numbers and paths', () => {
    expect(validateModelOutput({ headline: 'Bid is at 50% of target', explanation: 'You have 250.00 BetaUSD of 500.00 resting.', findings: [{ statement: 'Gap of 250.00 BetaUSD on the bid.', evidencePaths: ['mandate.shortfallBid'] }], caveats: [] }, det, facts)).toBeNull()
  })

  it('rejects an invented number', () => {
    expect(validateModelOutput({ headline: 'Bid is at 62% of target', explanation: 'x', findings: [], caveats: [] }, det, facts)).toBe('The model stated a number not in the report: 62.')
  })

  it('rejects a citation outside the allowed fields', () => {
    expect(validateModelOutput({ headline: 'h', explanation: 'x', findings: [{ statement: 's', evidencePaths: ['wallet.privateKey'] }], caveats: [] }, det, facts)).toBe('A finding cited an unknown field: wallet.privateKey.')
  })
})

describe('classifyQuestion', () => {
  it('routes a change question to the comparison', () => {
    expect(classifyQuestion('What changed since the last block?')).toBe('what_changed')
  })
})

import { describe, expect, it } from 'vitest'
import { plan } from '../policy/plan'
import { assessFreshness, buildHealthReport, verifyReportDigest } from './build'
import { compareReports } from './compare'
import { evaluateExceptions } from './exceptions'
import { updateIncidents } from './incidents'
import { simulatePolicyChange } from './simulate'
import { balances, input, levels, mandate, NOW, observation, own, planningSnapshot, U } from './test-fixtures'

describe('buildHealthReport', () => {
  it('separates own resting depth from external depth without double counting', () => {
    // #given a 250 bid of ours inside a 1,000 level at tick −30
    // #when the report is built
    const r = buildHealthReport(input())
    // #then total = 10 bid levels × 1,000, own = 250, external = total − own
    expect([r.depth.totalBid.value, r.depth.ownBid.value, r.depth.externalBid.value]).toEqual([(10_000n * U).toString(), (250n * U).toString(), (9_750n * U).toString()])
  })

  it('reports unreadable levels as null with a lower bound, never as zero', () => {
    // #given one bid level the RPC could not read
    const r = buildHealthReport(input({ observation: observation({ levels: levels({ 'b-50': { status: 'unreadable', liquidity: null } }) }) }))
    // #then total and external bid depth are unknown, quality is degraded
    expect({ total: r.depth.totalBid.value, lowerBound: r.depth.totalBid.lowerBound, external: r.depth.externalBid.value, quality: r.quality }).toEqual({ total: null, lowerBound: (9_000n * U).toString(), external: null, quality: 'DEGRADED' })
  })

  it('treats a level the reader skipped inside the band as unreadable', () => {
    // #given the −100 bid level is missing from the observation entirely
    const r = buildHealthReport(input({ observation: observation({ levels: levels().filter((l) => !(l.isBid && l.tick === -100)) }) }))
    // #then the band is marked partial
    expect(r.depth.unreadableLevelsInBand).toBe(1)
  })

  it('excludes an unconfirmed order from coverage and flags it', () => {
    // #given our order could not be read back
    const r = buildHealthReport(input({ ownOrders: [own({ status: 'unknown' })] }))
    // #then own depth and coverage are unknown rather than 250 or 0
    expect({ own: r.depth.ownBid.value, coverage: r.mandate?.coverageBid.status, unreconciled: r.risk.unreconciled }).toEqual({ own: null, coverage: 'UNKNOWN', unreconciled: true })
  })

  it('reports NOT_APPLICABLE coverage for a zero target instead of 100%', () => {
    const r = buildHealthReport(input({ mandate: mandate({ targetAskDepth: '0' }) }))
    expect([r.mandate?.coverageAsk.status, r.mandate?.coverageAsk.ratio]).toEqual(['NOT_APPLICABLE', null])
  })

  it('agrees with the v1 planner on coverage for the same observation', () => {
    // #given the same mandate and orders
    const m = mandate()
    const orders = [own(), own({ orderId: '2', isBid: false, tick: 30, flipTick: -30, remaining: (100n * U).toString() })]
    const proposal = plan(m, planningSnapshot(m, orders))
    // #when both compute coverage
    const r = buildHealthReport(input({ mandate: m, ownOrders: orders }))
    // #then the shortfalls match exactly
    expect([r.mandate?.shortfallBid.value, r.mandate?.shortfallAsk.value]).toEqual([proposal.coverage.bid.shortfall.toString(), proposal.coverage.ask.shortfall.toString()])
  })

  it('produces the same digest and report ID for the same input', () => {
    expect(buildHealthReport(input()).reportId).toBe(buildHealthReport(input()).reportId)
  })

  it('produces a different report for a different block', () => {
    expect(buildHealthReport(input()).reportId).not.toBe(buildHealthReport(input({ observation: observation({ blockNumber: '39243766' }) })).reportId)
  })

  it('detects a report altered after publication', () => {
    const r = buildHealthReport(input())
    const tampered = { ...r, depth: { ...r.depth, ownBid: { ...r.depth.ownBid, value: (999n * U).toString() } } }
    expect([verifyReportDigest(r), verifyReportDigest(tampered)]).toEqual([true, false])
  })

  it('keeps inventory buckets disjoint and summing to what is held', () => {
    // #given 10,000 PathUSD in the wallet, 40 in the DEX and a 100 reserve, with a 250 bid resting at 0.9997
    const r = buildHealthReport(input({ balances: { ...balances, quote: { wallet: (10_000n * U).toString(), dex: (40n * U).toString() } } }))
    const q = r.inventory?.quote
    // #then idle + DEX free + reserved = wallet + DEX, and the committed escrow is counted separately
    expect({ held: BigInt(q?.idleWallet ?? 0) + BigInt(q?.dexInternalFree ?? 0) + BigInt(q?.reservedPolicy ?? 0), committed: q?.committedResting }).toEqual({ held: 10_040n * U, committed: '249925000' })
  })

  it('is UNAVAILABLE with no observation and states why', () => {
    const r = buildHealthReport(input({ observation: null, observationError: 'no healthy upstreams available' }))
    expect([r.quality, r.depth.totalBid.value, r.depth.totalBid.reasonIfNull]).toEqual(['UNAVAILABLE', null, 'no healthy upstreams available'])
  })

  it('attributes nothing to an owner when no mandate is in scope', () => {
    const r = buildHealthReport({ ...input(), mandate: undefined, ownOrders: [] })
    expect({ own: r.depth.ownBid.value, external: r.depth.externalBid.value, mandate: r.mandate }).toEqual({ own: null, external: (10_000n * U).toString(), mandate: null })
  })
})

describe('assessFreshness', () => {
  it('marks a report stale once its observation passes the limit', () => {
    const r = buildHealthReport(input())
    expect([assessFreshness(r, NOW).stale, assessFreshness(r, NOW + 60_000).stale]).toEqual([false, true])
  })
})

describe('evaluateExceptions', () => {
  it('raises a bid shortfall with the exact verified amounts', () => {
    const r = buildHealthReport(input())
    const e = evaluateExceptions(r, { freshness: assessFreshness(r, NOW) }).find((x) => x.code === 'DEPTH_SHORTFALL_BID')
    expect(e?.explanation).toBe('250.00 BetaUSD of your 500.00 BetaUSD bid target is verified on the book (50%).')
  })

  it('blocks new orders and suppresses shortfalls when data is stale', () => {
    const r = buildHealthReport(input())
    const codes = evaluateExceptions(r, { freshness: assessFreshness(r, NOW + 120_000) }).map((x) => x.code)
    expect([codes.includes('MARKET_DATA_STALE'), codes.includes('DEPTH_SHORTFALL_BID')]).toEqual([true, false])
  })

  it('warns when a paused market still has orders on the book', () => {
    const r = buildHealthReport(input({ mandate: mandate({ status: 'paused' }) }))
    expect(evaluateExceptions(r, { freshness: assessFreshness(r, NOW) }).map((x) => x.code)).toContain('PAUSED_WITH_ORDERS')
  })

  it('points to funds idle in the DEX balance', () => {
    const r = buildHealthReport(input({ balances: { ...balances, quote: { wallet: (10_000n * U).toString(), dex: (99_970_000n).toString() } }, mandate: mandate({ reserveQuote: '0' }) }))
    expect(evaluateExceptions(r, { freshness: assessFreshness(r, NOW) }).find((x) => x.code === 'DEX_BALANCE_IDLE')?.title).toBe('99.97 PathUSD is waiting in your DEX balance')
  })

  it('lists high severity first', () => {
    const r = buildHealthReport(input({ ownOrders: [own({ status: 'unknown' })] }))
    expect(evaluateExceptions(r, { freshness: assessFreshness(r, NOW) })[0].severity).toBe('high')
  })
})

describe('updateIncidents', () => {
  it('opens once, counts repeat observations and resolves when the exception clears', () => {
    // #given a shortfall seen in two reports, then gone
    const r = buildHealthReport(input())
    const ex = evaluateExceptions(r, { freshness: assessFreshness(r, NOW) }).filter((x) => x.code === 'DEPTH_SHORTFALL_BID')
    let log = updateIncidents([], ex, { reportId: 'lhr_aaaaaaaaaaaa', block: '1', iso: '2026-10-12T08:00:00.000Z' })
    log = updateIncidents(log, ex, { reportId: 'lhr_bbbbbbbbbbbb', block: '2', iso: '2026-10-12T08:00:30.000Z' })
    log = updateIncidents(log, [], { reportId: 'lhr_cccccccccccc', block: '3', iso: '2026-10-12T08:01:00.000Z' })
    // #then one incident spans blocks 1 to 3
    expect(log.map((i) => [i.code, i.observations, i.openedBlock, i.resolvedBlock])).toEqual([['DEPTH_SHORTFALL_BID', 2, '1', '3']])
  })
})

describe('compareReports', () => {
  it('reports the change in own depth after a fill', () => {
    const a = buildHealthReport(input())
    const b = buildHealthReport(input({ observation: observation({ blockNumber: '39243800' }), ownOrders: [own({ remaining: (100n * U).toString() })] }))
    expect(compareReports(a, b).changes.find((c) => c.path === 'depth.ownBid')?.delta).toBe((-150n * U).toString())
  })

  it('refuses to compare reports measured over different bands', () => {
    const a = buildHealthReport(input())
    const b = buildHealthReport(input({ mandate: mandate({ bandTicks: 200 }) }))
    expect(compareReports(a, b).compatible).toBe(false)
  })
})

describe('simulatePolicyChange', () => {
  it('reports the new gap for a larger ask target without changing the saved plan', () => {
    // #given a 500 ask target and no asks resting
    const m = mandate()
    const before = JSON.stringify(m)
    // #when the operator asks for 800
    const sim = simulatePolicyChange(m, planningSnapshot(m, [own()]), { targetAskDepth: (800n * U).toString() })
    // #then the ask gap grows to 800 and the mandate object is untouched
    expect({ gap: sim.ok ? sim.after.shortfallAsk : null, unchanged: JSON.stringify(m) === before }).toEqual({ gap: (800n * U).toString(), unchanged: true })
  })

  it('rejects an impossible quote distance', () => {
    const m = mandate()
    const sim = simulatePolicyChange(m, planningSnapshot(m, []), { quoteOffsetTicks: 200 })
    expect(sim.ok).toBe(false)
  })
})

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { deterministicAnswer } from '../analyst/deterministic'
import { assessFreshness } from '../health/build'
import { compareReports } from '../health/compare'
import { evaluateExceptions } from '../health/exceptions'
import { parseBand, publicHealthReport, resolveMarket, supportedMarkets } from '../health/server'
import type { LiquidityHealthReport } from '../health/types'
import { formatTickPrice, hasBestAsk, hasBestBid } from '../market/ticks'
import { loadReport, paidApiStatus, verifyEntitlementToken } from '../server/mpp'

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] })
const refuse = (message: string, details?: Record<string, unknown>) => ({ isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: message, ...details }, null, 2) }] })

function howToBuy(marketId: string) {
  const paid = paidApiStatus()
  return paid.enabled
    ? { buy: `GET /v1/intelligence/markets/${marketId}/health`, protocol: 'MPP tempo.charge on Tempo Moderato', amount: paid.price, currency: 'pathUSD', then: 'Call this tool again with reportId and the Korrin-Entitlement token from the paid response.' }
    : { buy: 'Paid reports are not enabled on this deployment.', missing: paid.missing }
}

/** The same entitlement check as GET /v1/reports/{reportId}: payment is the only way in. */
async function paidReport(reportId: string, token: string): Promise<LiquidityHealthReport | null> {
  if (!paidApiStatus().enabled) return null
  const entitlement = await verifyEntitlementToken(token, reportId)
  return entitlement ? loadReport(reportId) : null
}

/**
 * Read-only MCP surface over the canonical health reports (PRD v2 §10). No tool
 * signs, places, cancels, withdraws or reads anyone's private plan.
 */
export function createKorrinMcpServer(): McpServer {
  const server = new McpServer({ name: 'korrin', version: '1.0.0' }, { instructions: 'Korrin publishes Liquidity Health Reports for stablecoin markets on Tempo Moderato testnet. Free tools return previews and exceptions. Full reports are bought over HTTP with MPP and read here with an entitlement token. No tool can move funds.' })

  server.registerTool('list_supported_markets', { title: 'List supported markets', description: 'Markets Korrin publishes health reports for, with IDs and current best prices.', inputSchema: {}, annotations: READ_ONLY }, async () => {
    const { markets, blockNumber } = await supportedMarkets()
    return ok({ block: blockNumber.toString(), markets: markets.map((m) => ({ marketId: m.marketId, base: m.base.symbol, quote: m.quote.symbol, bestBid: hasBestBid(m.bestBidTick) ? formatTickPrice(m.bestBidTick, 5) : null, bestAsk: hasBestAsk(m.bestAskTick) ? formatTickPrice(m.bestAskTick, 5) : null })) })
  })

  server.registerTool(
    'get_market_health_preview',
    { title: 'Market health preview', description: 'Free summary of a market: report quality, best prices, spread and how much of the band could be read. No depth decomposition.', inputSchema: { marketId: z.string().max(80), bandBps: z.number().int().min(1).max(50).optional() }, annotations: READ_ONLY },
    async ({ marketId, bandBps }) => {
      const market = await resolveMarket(marketId)
      if (!market) return refuse(`No supported market "${marketId}". Call list_supported_markets.`)
      const r = await publicHealthReport(market, parseBand(bandBps === undefined ? null : String(bandBps)) ?? 10)
      return ok({ preview: true, reportId: r.reportId, market: r.market.marketId, block: r.window.block, observedAt: r.window.observedAt, freshness: assessFreshness(r, Date.now()), quality: r.quality, qualityReasons: r.qualityReasons, quote: r.quote, band: r.methodology.band, levelsInBand: r.depth.levelsInBand, unreadableLevelsInBand: r.depth.unreadableLevelsInBand, fullReport: howToBuy(market.marketId) })
    },
  )

  server.registerTool(
    'get_market_exceptions',
    { title: 'Market exceptions', description: 'Deterministic exceptions for a market right now: stale or unreadable data, crossed book. Each has an explanation and a recovery path.', inputSchema: { marketId: z.string().max(80), bandBps: z.number().int().min(1).max(50).optional() }, annotations: READ_ONLY },
    async ({ marketId, bandBps }) => {
      const market = await resolveMarket(marketId)
      if (!market) return refuse(`No supported market "${marketId}". Call list_supported_markets.`)
      const r = await publicHealthReport(market, parseBand(bandBps === undefined ? null : String(bandBps)) ?? 10)
      return ok({ reportId: r.reportId, block: r.window.block, exceptions: evaluateExceptions(r, { freshness: assessFreshness(r, Date.now()) }).map((e) => ({ code: e.code, severity: e.severity, title: e.title, explanation: e.explanation, recovery: e.recovery })) })
    },
  )

  server.registerTool(
    'get_market_health',
    { title: 'Paid market health report', description: 'The full, immutable Liquidity Health Report you bought over HTTP with MPP. Requires the reportId and Korrin-Entitlement token from that purchase.', inputSchema: { marketId: z.string().max(80), reportId: z.string().max(40).optional(), entitlementToken: z.string().max(200).optional() }, annotations: READ_ONLY },
    async ({ marketId, reportId, entitlementToken }) => {
      if (!reportId || !entitlementToken) return refuse('A paid report needs reportId and entitlementToken.', howToBuy(marketId))
      const r = await paidReport(reportId, entitlementToken)
      if (!r) return refuse('No valid entitlement for that report.', howToBuy(marketId))
      return ok({ report: r, freshness: assessFreshness(r, Date.now()) })
    },
  )

  server.registerTool(
    'get_liquidity_coverage',
    { title: 'Liquidity in the band', description: 'Bid and ask depth inside the band from a paid report, with unreadable levels reported as unknown with a lower bound.', inputSchema: { reportId: z.string().max(40), entitlementToken: z.string().max(200) }, annotations: READ_ONLY },
    async ({ reportId, entitlementToken }) => {
      const r = await paidReport(reportId, entitlementToken)
      if (!r) return refuse('No valid entitlement for that report.')
      return ok({ reportId: r.reportId, market: r.market.marketId, block: r.window.block, quality: r.quality, band: r.methodology.band, unit: r.market.base, decimals: r.market.decimals, totalBid: r.depth.totalBid, totalAsk: r.depth.totalAsk, levelsInBand: r.depth.levelsInBand, unreadableLevelsInBand: r.depth.unreadableLevelsInBand })
    },
  )

  server.registerTool(
    'explain_liquidity_change',
    { title: 'Explain a liquidity change', description: 'Deterministic, field-by-field comparison of two paid reports for the same market and band.', inputSchema: { reportIdA: z.string().max(40), entitlementTokenA: z.string().max(200), reportIdB: z.string().max(40), entitlementTokenB: z.string().max(200) }, annotations: READ_ONLY },
    async ({ reportIdA, entitlementTokenA, reportIdB, entitlementTokenB }) => {
      const [a, b] = await Promise.all([paidReport(reportIdA, entitlementTokenA), paidReport(reportIdB, entitlementTokenB)])
      if (!a || !b) return refuse('Both reports need a valid entitlement.')
      const [before, after] = Date.parse(a.window.observedAt ?? '') <= Date.parse(b.window.observedAt ?? '') ? [a, b] : [b, a]
      const answer = deterministicAnswer('what_changed', { report: after, previous: before, exceptions: [], incidents: [], simulation: null, ageSeconds: assessFreshness(after, Date.now()).ageSeconds })
      return ok({ comparison: compareReports(before, after), headline: answer.headline, findings: answer.findings })
    },
  )

  server.registerTool(
    'get_mandate_status',
    { title: 'Private market status', description: 'Status of an operator’s private market plan. Not available to external agents in this deployment.', inputSchema: { mandateId: z.string().max(80) }, annotations: READ_ONLY },
    async () => refuse('Private market plans live in the operator’s own workspace and need the operator’s authentication. Korrin has no server-side tenant access yet, so this tool refuses every request. Payment never grants access to private plans.'),
  )

  return server
}

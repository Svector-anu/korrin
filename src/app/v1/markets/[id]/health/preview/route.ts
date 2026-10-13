import { parseBand, publicHealthReport, resolveMarket } from '@/lib/health/server'
import { assessFreshness } from '@/lib/health/build'
import { apiError, apiJson, rateLimit, rateLimited, traceId } from '@/lib/server/api'
import { describeError } from '@/lib/tempo/reads'

/** Free, clearly labelled summary. The depth decomposition is only in the paid report. */
export async function GET(request: Request, ctx: RouteContext<'/v1/markets/[id]/health/preview'>) {
  const trace = traceId()
  const limit = await rateLimit(request, 'preview', 60)
  if (!limit.ok) return rateLimited(limit.resetSeconds, trace)
  const { id } = await ctx.params
  const band = parseBand(new URL(request.url).searchParams.get('bandBps'))
  if (band === null) return apiError('INVALID_INPUT', 'bandBps must be a whole number from 1 to 50.', { trace })
  try {
    const market = await resolveMarket(id)
    if (!market) return apiError('UNSUPPORTED_PAIR', `No supported market "${id}". See /v1/markets.`, { trace })
    const r = await publicHealthReport(market, band)
    return apiJson(
      {
        preview: true,
        notice: 'Summary only. The full report adds depth in the band, split by side, with lower bounds for unreadable levels, plus its digest and evidence.',
        reportId: r.reportId,
        market: r.market,
        network: r.network,
        window: r.window,
        freshness: assessFreshness(r, Date.now()),
        quality: r.quality,
        qualityReasons: r.qualityReasons,
        quote: r.quote,
        band: r.methodology.band,
        coverage: { levelsInBand: r.depth.levelsInBand, unreadableLevelsInBand: r.depth.unreadableLevelsInBand },
        disclosures: r.disclosures,
        fullReport: `/v1/intelligence/markets/${market.marketId}/health?bandBps=${band}`,
      },
      { trace },
    )
  } catch (error) {
    return apiError('UPSTREAM_TIMEOUT', `The market could not be read: ${describeError(error)}`, { trace })
  }
}

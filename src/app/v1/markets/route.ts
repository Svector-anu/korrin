import { supportedMarkets } from '@/lib/health/server'
import { apiError, apiJson, rateLimit, rateLimited, traceId } from '@/lib/server/api'
import { formatTickPrice, hasBestAsk, hasBestBid } from '@/lib/market/ticks'
import { describeError } from '@/lib/tempo/reads'

export async function GET(request: Request) {
  const trace = traceId()
  const limit = await rateLimit(request, 'markets', 120)
  if (!limit.ok) return rateLimited(limit.resetSeconds, trace)
  try {
    const { markets, blockNumber, observedAt } = await supportedMarkets()
    return apiJson(
      {
        block: blockNumber.toString(),
        observedAt: new Date(observedAt).toISOString(),
        markets: markets.map((m) => ({
          marketId: m.marketId,
          base: { symbol: m.base.symbol, address: m.base.address, decimals: m.base.decimals },
          quote: { symbol: m.quote.symbol, address: m.quote.address, decimals: m.quote.decimals },
          bookKey: m.bookKey,
          bestBid: hasBestBid(m.bestBidTick) ? formatTickPrice(m.bestBidTick, 5) : null,
          bestAsk: hasBestAsk(m.bestAskTick) ? formatTickPrice(m.bestAskTick, 5) : null,
          preview: `/v1/markets/${m.marketId}/health/preview`,
          report: `/v1/intelligence/markets/${m.marketId}/health`,
        })),
      },
      { trace },
    )
  } catch (error) {
    return apiError('UPSTREAM_TIMEOUT', `The DEX could not be read: ${describeError(error)}`, { trace })
  }
}

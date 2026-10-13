import { apiJson } from '@/lib/server/api'
import { CHALLENGE_TTL_MINUTES, paidApiStatus } from '@/lib/server/mpp'
import { HEALTH_METHODOLOGY_VERSION, HEALTH_SCHEMA_VERSION } from '@/lib/health/types'
import { CHAIN_ID } from '@/lib/tempo/chain'

/** Discovery document for agents and developers. */
export function GET(request: Request) {
  const origin = new URL(request.url).origin
  const paid = paidApiStatus()
  return apiJson({
    name: 'Korrin market intelligence API',
    version: 'v1',
    docs: `${origin}/developers`,
    network: { chainId: CHAIN_ID, name: 'Tempo Moderato testnet', environment: 'testnet' },
    schema: { report: HEALTH_SCHEMA_VERSION, methodology: HEALTH_METHODOLOGY_VERSION },
    endpoints: [
      { method: 'GET', path: '/v1/markets', access: 'public', description: 'Supported markets with their IDs and current best prices.' },
      { method: 'GET', path: '/v1/markets/{marketId}/health/preview', access: 'public', description: 'Free summary: quality, best prices, spread and how much of the band could be read. No depth decomposition.' },
      {
        method: 'GET',
        path: '/v1/intelligence/markets/{marketId}/health',
        access: 'mpp',
        description: 'The full, immutable Liquidity Health Report for the current block. Pay once with MPP; retries with the same credential return the same report.',
        payment: paid.enabled
          ? { protocol: 'mpp', intent: 'charge', method: 'tempo', network: 'tempo-moderato', chainId: CHAIN_ID, currency: paid.currency, currencySymbol: 'pathUSD', amount: paid.price, recipient: paid.recipient, challengeTtlMinutes: CHALLENGE_TTL_MINUTES }
          : { status: 'not_configured', missing: paid.missing },
        query: { bandBps: 'Half-width of the price band around the mid, 1 to 50. Default 10.' },
      },
      { method: 'GET', path: '/v1/reports/{reportId}', access: 'entitlement', description: 'Retrieve a report you already paid for, with the Korrin-Entitlement token or the original Payment credential. Never charges again.' },
    ],
    errors: 'Errors use { error: { code, message, retryable, traceId } }.',
  }, { headers: { 'cache-control': 'public, max-age=60' } })
}

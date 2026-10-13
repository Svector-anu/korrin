import { parseBand, publicHealthReport, resolveMarket } from '@/lib/health/server'
import { apiError, rateLimit, rateLimited, traceId } from '@/lib/server/api'
import { deliverPaidReport } from '@/lib/server/deliver'
import { chargeFor, credentialFromRequest, entitlementForCredential, loadReport, paidApiStatus, pinReport, recordEntitlement } from '@/lib/server/mpp'
import { describeError } from '@/lib/tempo/reads'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function annotate(response: Response, headers: Record<string, string>): Response {
  const out = new Response(response.body, response)
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v)
  return out
}

/**
 * MPP-protected Liquidity Health Report (PRD v2 §8.4).
 *
 * 1. No credential: build and pin a fresh report, answer 402 with a tempo.charge
 *    challenge bound to that report ID.
 * 2. Credential already granted: return the same report and receipt, no new charge.
 * 3. New credential: the pinned report must still exist before mppx verifies and
 *    settles; only a verified payment records an entitlement and delivers.
 */
export async function GET(request: Request, ctx: RouteContext<'/v1/intelligence/markets/[id]/health'>) {
  const trace = traceId()
  const limit = await rateLimit(request, 'paid-health', 30)
  if (!limit.ok) return rateLimited(limit.resetSeconds, trace)

  const status = paidApiStatus()
  if (!status.enabled) return apiError('PAYMENT_NOT_CONFIGURED', 'Paid reports are not enabled on this deployment. The free preview is available.', { trace, details: { missing: status.missing } })

  const { id } = await ctx.params
  const band = parseBand(new URL(request.url).searchParams.get('bandBps'))
  if (band === null) return apiError('INVALID_INPUT', 'bandBps must be a whole number from 1 to 50.', { trace })

  try {
    const market = await resolveMarket(id)
    if (!market) return apiError('UNSUPPORTED_PAIR', `No supported market "${id}". See /v1/markets.`, { trace })

    const cred = credentialFromRequest(request)
    if (!cred) {
      const report = await publicHealthReport(market, band)
      if (report.quality === 'UNAVAILABLE') return apiError('REPORT_TEMPORARILY_UNAVAILABLE', `No report can be built right now: ${report.qualityReasons[0] ?? 'the market could not be read'}. Nothing was charged.`, { trace })
      await pinReport(report)
      const result = await chargeFor(report.reportId, market.marketId)(request)
      if (result.status === 402) return annotate(result.challenge, { 'x-korrin-report-id': report.reportId, 'x-korrin-trace': trace })
      return apiError('PAYMENT_REQUIRED', 'A payment credential is required.', { trace })
    }

    if (!cred.reportId) return apiError('PAYMENT_NOT_VERIFIED', 'The credential is not bound to a Korrin report. Request a new challenge.', { trace })

    const granted = await entitlementForCredential(cred.digest)
    if (granted) {
      const pinned = await loadReport(granted.reportId)
      if (pinned) return deliverPaidReport(pinned, granted, 'RETRIEVABLE', trace)
    }

    const report = await loadReport(cred.reportId)
    if (!report) return apiError('REPORT_NOT_FOUND', 'The report this credential was issued for is no longer held. Request a new challenge; nothing was charged.', { trace })
    if (report.market.marketId !== market.marketId) return apiError('INVALID_INPUT', `This credential is for ${report.market.marketId}, not ${market.marketId}.`, { trace })

    const result = await chargeFor(report.reportId, report.market.marketId)(request)
    if (result.status === 402) {
      // A concurrent request with the same credential may have won the replay claim.
      for (let i = 0; i < 6; i++) {
        await sleep(750)
        const winner = await entitlementForCredential(cred.digest)
        if (winner) return deliverPaidReport(report, winner, 'RETRIEVABLE', trace)
      }
      return annotate(result.challenge, { 'x-korrin-report-id': report.reportId, 'x-korrin-trace': trace, 'x-korrin-error': 'PAYMENT_NOT_VERIFIED' })
    }

    const receiptHeader = result.withReceipt(new Response(null)).headers.get('payment-receipt')
    if (!receiptHeader) return apiError('PAYMENT_NOT_VERIFIED', 'The payment verified but no receipt was produced. Retry with the same credential.', { trace })
    const entitlement = await recordEntitlement({ report, challengeId: cred.credential.challenge.id, credentialDigest: cred.digest, receiptHeader })
    return deliverPaidReport(report, entitlement, 'DELIVERED', trace)
  } catch (error) {
    return apiError('UPSTREAM_TIMEOUT', `The request could not be completed: ${describeError(error)}. If you paid, retry with the same credential to retrieve the report without paying again.`, { trace })
  }
}

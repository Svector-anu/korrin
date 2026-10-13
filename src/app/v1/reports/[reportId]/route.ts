import { apiError, rateLimit, rateLimited, traceId } from '@/lib/server/api'
import { deliverPaidReport } from '@/lib/server/deliver'
import { credentialFromRequest, entitlementForCredential, loadReport, paidApiStatus, verifyEntitlementToken } from '@/lib/server/mpp'

/** Retrieval for a report already paid for. Never issues a challenge and never charges. */
export async function GET(request: Request, ctx: RouteContext<'/v1/reports/[reportId]'>) {
  const trace = traceId()
  const limit = await rateLimit(request, 'report-retrieve', 60)
  if (!limit.ok) return rateLimited(limit.resetSeconds, trace)
  if (!paidApiStatus().enabled) return apiError('PAYMENT_NOT_CONFIGURED', 'Paid reports are not enabled on this deployment.', { trace })

  const { reportId } = await ctx.params
  const token = request.headers.get('korrin-entitlement') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  const entitlement = token && !token.startsWith('Payment') ? await verifyEntitlementToken(token, reportId) : null
  const fromCredential = !entitlement ? credentialFromRequest(request) : null
  const granted = entitlement ?? (fromCredential ? await entitlementForCredential(fromCredential.digest) : null)
  if (!granted || granted.reportId !== reportId) return apiError('ENTITLEMENT_REQUIRED', 'Send the Korrin-Entitlement token from the paid response, or the original Payment credential.', { trace })

  const report = await loadReport(reportId)
  if (!report) return apiError('REPORT_NOT_FOUND', 'This report is no longer held.', { trace })
  return deliverPaidReport(report, granted, 'RETRIEVABLE', trace)
}

import { assessFreshness } from '../health/build'
import type { LiquidityHealthReport } from '../health/types'
import { apiJson } from './api'
import { type Entitlement, entitlementToken } from './mpp'

/** The paid response body and headers. Identical on first delivery and on every retrieval. */
export async function deliverPaidReport(report: LiquidityHealthReport, entitlement: Entitlement, status: Entitlement['status'], trace: string): Promise<Response> {
  const token = await entitlementToken(entitlement)
  return apiJson(
    {
      report,
      freshness: assessFreshness(report, Date.now()),
      entitlement: {
        id: entitlement.id,
        status,
        reportId: entitlement.reportId,
        protocol: entitlement.protocol,
        method: entitlement.method,
        paymentReference: entitlement.paymentReference,
        amount: entitlement.amount,
        asset: entitlement.asset,
        network: entitlement.network,
        recipient: entitlement.recipient,
        verifiedAt: entitlement.verifiedAt,
        retrieve: { url: `/v1/reports/${entitlement.reportId}`, header: 'Korrin-Entitlement', token },
      },
    },
    {
      trace,
      headers: {
        'payment-receipt': entitlement.receipt,
        'korrin-entitlement': token,
        'x-korrin-report-id': report.reportId,
        'cache-control': 'private, no-store',
      },
    },
  )
}

import { json, jsonError } from '@/lib/server/json'
import { describeError, getEventsForOrders } from '@/lib/tempo/reads'

/** GET /api/events?ids=1,2&fromBlock=123 : decoded DEX lifecycle events for these orders. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
  const from = url.searchParams.get('fromBlock') ?? ''
  if (ids.length === 0 || ids.length > 32 || ids.some((p) => !/^\d{1,38}$/.test(p)) || !/^\d{1,20}$/.test(from)) return jsonError('ids (up to 32) and fromBlock are required', 400)
  try {
    return json(await getEventsForOrders(ids.map(BigInt), BigInt(from)))
  } catch (error) {
    return jsonError(`Event read failed: ${describeError(error)}`)
  }
}

import { json, jsonError } from '@/lib/server/json'
import { describeError, getOrders } from '@/lib/tempo/reads'

/** Independent readback of native order state. GET /api/orders?ids=1,2,3 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('ids') ?? ''
  const parts = raw.split(',').filter(Boolean)
  if (parts.length > 64 || parts.some((p) => !/^\d{1,38}$/.test(p))) return jsonError('ids must be up to 64 decimal order IDs', 400)
  try {
    return json(await getOrders(parts.map((p) => BigInt(p))))
  } catch (error) {
    return jsonError(`Order readback failed: ${describeError(error)}`)
  }
}

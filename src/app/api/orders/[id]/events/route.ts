import { json, jsonError } from '@/lib/server/json'
import { describeError, getOrderEvents } from '@/lib/tempo/reads'

export async function GET(request: Request, ctx: RouteContext<'/api/orders/[id]/events'>) {
  const { id } = await ctx.params
  const from = new URL(request.url).searchParams.get('fromBlock') ?? ''
  if (!/^\d{1,38}$/.test(id) || !/^\d{1,20}$/.test(from)) return jsonError('Order ID and fromBlock are required', 400)
  try {
    return json(await getOrderEvents(BigInt(id), BigInt(from)))
  } catch (error) {
    return jsonError(`Event read failed: ${describeError(error)}`)
  }
}

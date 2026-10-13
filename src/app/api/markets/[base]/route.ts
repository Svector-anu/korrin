import { isAddress } from 'viem'
import { json, jsonError } from '@/lib/server/json'
import { describeError, getMarketSnapshot } from '@/lib/tempo/reads'

export async function GET(request: Request, ctx: RouteContext<'/api/markets/[base]'>) {
  const { base } = await ctx.params
  const url = new URL(request.url)
  const quote = url.searchParams.get('quote')
  const from = Number(url.searchParams.get('from') ?? -200)
  const to = Number(url.searchParams.get('to') ?? 200)
  const quoteAddress = quote && isAddress(quote) ? quote : null
  if (!isAddress(base) || (quote && !quoteAddress)) return jsonError('Invalid token address', 400)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 800) return jsonError('Tick window must span at most 800 ticks', 400)
  try {
    return json(await getMarketSnapshot(base, quoteAddress, { from, to }))
  } catch (error) {
    return jsonError(`Market read failed: ${describeError(error)}`)
  }
}

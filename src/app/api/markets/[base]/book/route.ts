import { isAddress } from 'viem'
import { json, jsonError } from '@/lib/server/json'
import { describeError, getBookState } from '@/lib/tempo/reads'

export async function GET(request: Request, ctx: RouteContext<'/api/markets/[base]/book'>) {
  const { base } = await ctx.params
  const quote = new URL(request.url).searchParams.get('quote')
  const quoteAddress = quote && isAddress(quote) ? quote : null
  if (!isAddress(base) || (quote && !quoteAddress)) return jsonError('Invalid token address', 400)
  try {
    return json(await getBookState(base, quoteAddress))
  } catch (error) {
    return jsonError(`Book read failed: ${describeError(error)}`)
  }
}

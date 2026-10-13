import { isAddress } from 'viem'
import { json, jsonError } from '@/lib/server/json'
import { describeError, getBalances } from '@/lib/tempo/reads'

/** GET /api/balances?account=0x..&tokens=0x..,0x.. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const account = url.searchParams.get('account') ?? ''
  const tokens = (url.searchParams.get('tokens') ?? '').split(',').filter(Boolean)
  if (!isAddress(account) || tokens.length === 0 || tokens.length > 8 || !tokens.every((t) => isAddress(t))) return jsonError('account and up to 8 tokens are required', 400)
  try {
    return json(await getBalances(account, tokens as `0x${string}`[]))
  } catch (error) {
    return jsonError(`Balance read failed: ${describeError(error)}`)
  }
}

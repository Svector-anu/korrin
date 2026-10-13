import { json, jsonError } from '@/lib/server/json'
import { describeError, getChainHead } from '@/lib/tempo/reads'
import { CHAIN_ID, RPC_HOST } from '@/lib/tempo/chain'

export async function GET() {
  try {
    return json({ chainId: CHAIN_ID, source: RPC_HOST, ...(await getChainHead()) })
  } catch (error) {
    return jsonError(`Chain head unavailable: ${describeError(error)}`)
  }
}

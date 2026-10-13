import { json, jsonError } from '@/lib/server/json'
import { describeError, listMarkets } from '@/lib/tempo/reads'

export async function GET() {
  try {
    return json(await listMarkets())
  } catch (error) {
    return jsonError(`Could not read DEX books: ${describeError(error)}`)
  }
}

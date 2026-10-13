import { createPublicClient, http } from 'viem'
import { tempoModerato } from 'viem/chains'
import { Abis, Addresses, Actions } from 'viem/tempo'

const client = createPublicClient({ chain: tempoModerato, transport: http() })
const dex = { address: Addresses.stablecoinDex, abi: Abis.stablecoinDex } as const

const main = async () => {
  console.log('chainId', await client.getChainId(), 'block', await client.getBlockNumber())
  for (const fn of ['MIN_TICK', 'MAX_TICK', 'TICK_SPACING', 'PRICE_SCALE', 'MIN_ORDER_AMOUNT', 'nextOrderId'] as const) {
    try { console.log(fn, await client.readContract({ ...dex, functionName: fn })) } catch (e) { console.log(fn, 'ERR', (e as Error).message.split('\n')[0]) }
  }
  for (let i = 0; i < 8; i++) {
    const token = `0x20c000000000000000000000000000000000000${i}` as const
    try {
      const m = await Actions.token.getMetadata(client, { token })
      console.log(token, m)
    } catch (e) { console.log(token, 'ERR', (e as Error).message.split('\n')[0]) }
  }
  for (let i = 0; i < 12; i++) {
    try {
      const key = await client.readContract({ ...dex, functionName: 'bookKeyForIndex', args: [i] })
      const book = await client.readContract({ ...dex, functionName: 'books', args: [key] })
      console.log('book', i, key, book)
    } catch (e) { console.log('book', i, 'ERR', (e as Error).message.split('\n')[0]); break }
  }
}
main()

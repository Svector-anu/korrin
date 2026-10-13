import {
  type Address,
  type Hex,
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  encodePacked,
  getAddress,
  http,
  keccak256,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  pad,
  parseAbiItem,
  toHex,
} from 'viem'
import { Abis } from 'viem/tempo'
import { hasBestAsk, hasBestBid } from '../market/ticks'
import { CHAIN_ID, DEX_ADDRESS, korrinChain, PATH_USD, RPC_HOST } from './chain'

/**
 * Read-only access to Tempo. Nothing in this module signs or submits; execution
 * authority lives in the operator's browser signer.
 */
const client = createPublicClient({
  chain: korrinChain,
  transport: http(undefined, { timeout: 8_000, retryCount: 1 }),
  batch: { multicall: false },
})

/** Separate fast-fail transport for getTickLevel, which can hang on some levels. */
const levelClient = createPublicClient({
  chain: korrinChain,
  transport: http(undefined, { timeout: 3_000, retryCount: 0 }),
})

const dex = { address: DEX_ADDRESS, abi: Abis.stablecoinDex } as const

type CacheEntry<T> = { value: T; expires: number }
const cache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expires > Date.now()) return hit.value
  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending) return pending
  const promise = load()
    .then((value) => {
      cache.set(key, { value, expires: Date.now() + ttlMs })
      return value
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

/**
 * Stale-while-revalidate with a hard bound: an expired value is returned while a
 * refresh runs, but only for maxStaleMs. Every payload carries its own observedAt,
 * so callers always show the real age of what they render.
 */
async function swr<T>(key: string, ttlMs: number, load: () => Promise<T>, maxStaleMs = ttlMs * 3): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expires > Date.now()) return hit.value
  const refresh = () => {
    const pending = inflight.get(key) as Promise<T> | undefined
    if (pending) return pending
    const promise = load()
      .then((value) => {
        cache.set(key, { value, expires: Date.now() + ttlMs })
        return value
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, promise)
    return promise
  }
  // Serve a stale copy only briefly; past maxStale, wait for a fresh read (or fail loudly).
  if (hit && Date.now() - hit.expires < maxStaleMs) {
    refresh().catch(() => undefined)
    return hit.value
  }
  return refresh()
}

/** Drops cached reads, for scripts that need a fresh observation at each step. */
export function resetReadCache(): void {
  cache.clear()
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

export function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) return revert.data.errorName
    const details = (error as BaseError & { details?: string }).details
    if (details?.includes('out of gas') || details?.includes('exceeds defined limit')) return 'precompile gas limit'
    if (details?.startsWith('<!DOCTYPE') || details?.includes('<html')) return 'RPC gateway error'
    if (error.shortMessage.includes('took too long')) return 'RPC timeout'
    return error.shortMessage
  }
  return error instanceof Error ? error.message : String(error)
}

export const pairKey = (base: Address, quote: Address): Hex => keccak256(encodePacked(['address', 'address'], [base, quote]))

export type TokenInfo = {
  address: Address
  name: string
  symbol: string
  decimals: number
  currency: string
  quoteToken: Address | null
  paused: boolean
}

const tokenCalls = (token: Address) => {
  const tip20 = { address: token, abi: Abis.tip20 } as const
  return [
    { ...tip20, functionName: 'name' },
    { ...tip20, functionName: 'symbol' },
    { ...tip20, functionName: 'decimals' },
    { ...tip20, functionName: 'currency' },
    { ...tip20, functionName: 'quoteToken' },
    { ...tip20, functionName: 'paused' },
  ] as const
}

type TokenCallResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }

function toTokenInfo(token: Address, r: readonly TokenCallResult[]): TokenInfo | null {
  const [name, symbol, decimals, currency, quoteToken, paused] = r
  if (symbol.status !== 'success' || decimals.status !== 'success') return null
  return {
    address: token,
    name: name.status === 'success' ? String(name.result) : String(symbol.result),
    symbol: String(symbol.result),
    decimals: Number(decimals.result),
    currency: currency.status === 'success' ? String(currency.result) : 'unknown',
    quoteToken: quoteToken.status === 'success' ? getAddress(quoteToken.result as Address) : null,
    paused: paused.status === 'success' ? Boolean(paused.result) : false,
  }
}

/** Reads TIP-20 metadata for many tokens in a few chunked multicalls. */
async function getTokens(addresses: Address[]): Promise<Map<Address, TokenInfo>> {
  const out = new Map<Address, TokenInfo>()
  const missing: Address[] = []
  for (const a of addresses.map((x) => getAddress(x))) {
    const hit = cache.get(`token:${a}`) as CacheEntry<TokenInfo> | undefined
    if (hit && hit.expires > Date.now()) out.set(a, hit.value)
    else if (!missing.includes(a)) missing.push(a)
  }
  const CHUNK = 20
  for (let i = 0; i < missing.length; i += CHUNK) {
    const slice = missing.slice(i, i + CHUNK)
    const results = (await client.multicall({ allowFailure: true, contracts: slice.flatMap(tokenCalls) })) as TokenCallResult[]
    slice.forEach((token, j) => {
      const info = toTokenInfo(token, results.slice(j * 6, j * 6 + 6))
      if (info) {
        cache.set(`token:${token}`, { value: info, expires: Date.now() + 120_000 })
        out.set(token, info)
      }
    })
  }
  return out
}

export async function getToken(address: Address): Promise<TokenInfo> {
  const token = getAddress(address)
  return cached(`token:${token}`, 120_000, async () => {
    const results = (await client.multicall({ allowFailure: true, contracts: tokenCalls(token) })) as TokenCallResult[]
    const info = toTokenInfo(token, results)
    if (!info) throw new Error(`${token} is not a readable TIP-20 token`)
    return info
  })
}


export type DexConstants = { minOrderAmount: bigint; tickSpacing: number; minTick: number; maxTick: number }

export async function getDexConstants(): Promise<DexConstants> {
  return cached('dex:constants', 300_000, async () => {
    const [minOrderAmount, tickSpacing, minTick, maxTick] = await client.multicall({
      allowFailure: false,
      contracts: [
        { ...dex, functionName: 'MIN_ORDER_AMOUNT' },
        { ...dex, functionName: 'TICK_SPACING' },
        { ...dex, functionName: 'MIN_TICK' },
        { ...dex, functionName: 'MAX_TICK' },
      ],
    })
    return { minOrderAmount, tickSpacing, minTick, maxTick }
  })
}

export type MarketSummary = {
  bookKey: Hex
  index: number
  base: TokenInfo
  quote: TokenInfo
  bestBidTick: number
  bestAskTick: number
  /** Curated USD test tokens issued by the Tempo faucet; everything else is user-created. */
  canonical: boolean
}

const CANONICAL = new Set(
  ['0x20c0000000000000000000000000000000000001', '0x20c0000000000000000000000000000000000002', '0x20c0000000000000000000000000000000000003'].map((a) => getAddress(a)),
)
const MAX_BOOKS = 48

export type MarketList = { markets: MarketSummary[]; blockNumber: bigint; observedAt: number; source: string; scanned: number; skipped: number }

/** Enumerates books straight from the DEX via bookKeyForIndex until it reverts. */
export async function listMarkets(): Promise<MarketList> {
  return swr('markets', 30_000, async () => {
    const blockNumber = await client.getBlockNumber()
    const observedAt = Date.now()
    const keys = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: Array.from({ length: MAX_BOOKS }, (_, i) => ({ ...dex, functionName: 'bookKeyForIndex' as const, args: [i] as const })),
    })
    const indexed = keys.flatMap((k, index) => (k.status === 'success' ? [{ index, key: k.result }] : []))
    const books = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: indexed.map(({ key }) => ({ ...dex, functionName: 'books' as const, args: [key] as const })),
    })
    const pairs = indexed.flatMap(({ index, key }, i) => {
      const book = books[i]
      return book.status === 'success' ? [{ index, key, base: getAddress(book.result.base), quote: getAddress(book.result.quote), book: book.result }] : []
    })
    const tokens = await getTokens(pairs.flatMap((p) => [p.base, p.quote]))
    let skipped = 0
    const markets: MarketSummary[] = []
    for (const p of pairs) {
      const base = tokens.get(p.base)
      const quote = tokens.get(p.quote)
      if (!base || !quote) {
        skipped++
        continue
      }
      markets.push({
        bookKey: p.key,
        index: p.index,
        base,
        quote,
        bestBidTick: p.book.bestBidTick,
        bestAskTick: p.book.bestAskTick,
        canonical: CANONICAL.has(base.address) && quote.address === getAddress(PATH_USD),
      })
    }
    // Every book skipped means metadata reads failed, not that the DEX is empty.
    if (pairs.length > 0 && markets.length === 0) throw new Error(`Token metadata unavailable for all ${pairs.length} books`)
    markets.sort((a, b) => Number(b.canonical) - Number(a.canonical) || a.base.symbol.localeCompare(b.base.symbol))
    return { markets, blockNumber, observedAt, source: RPC_HOST, scanned: indexed.length, skipped }
  })
}

export type LevelReading = {
  tick: number
  isBid: boolean
  status: 'ok' | 'unreadable'
  liquidity: bigint | null
  head: bigint | null
  error?: string
}

const MAX_LEVELS_PER_SIDE = 16
const failedLevels = new Map<string, { error: string; until: number }>()

async function readLevel(base: Address, tick: number, isBid: boolean): Promise<LevelReading> {
  const key = `${base}:${tick}:${isBid}`
  const failed = failedLevels.get(key)
  if (failed && failed.until > Date.now()) return { tick, isBid, status: 'unreadable', liquidity: null, head: null, error: failed.error }
  try {
    // getTickLevel walks every order at the level, so gas grows with order count.
    // Just under the RPC's 50M cap, crowded levels fail fast with a definite
    // out-of-gas instead of a gateway timeout.
    const { data } = await levelClient.call({ to: DEX_ADDRESS, data: encodeFunctionData({ abi: Abis.stablecoinDex, functionName: 'getTickLevel', args: [base, tick, isBid] }), gas: 49_000_000n })
    if (!data) throw new Error('empty getTickLevel result')
    const [head, , totalLiquidity] = decodeFunctionResult({ abi: Abis.stablecoinDex, functionName: 'getTickLevel', data })
    return { tick, isBid, status: 'ok', liquidity: totalLiquidity, head }
  } catch (error) {
    const message = describeError(error)
    failedLevels.set(key, { error: message, until: Date.now() + 120_000 })
    return { tick, isBid, status: 'unreadable', liquidity: null, head: null, error: message }
  }
}

export type ExecutionQuote = { side: 'sell_base' | 'buy_base'; amountIn: bigint; amountOut: bigint | null; error?: string }

export type MarketSnapshot = {
  chainId: number
  blockNumber: bigint
  observedAt: number
  source: string
  bookKey: Hex
  base: TokenInfo
  quote: TokenInfo
  bestBidTick: number
  bestAskTick: number
  exists: boolean
  levels: LevelReading[]
  quotes: ExecutionQuote[]
  constants: DexConstants
}

export async function getMarketSnapshot(base: Address, quoteAddress: Address | null, window: { from: number; to: number }): Promise<MarketSnapshot> {
  const baseToken = await getToken(base)
  const quote = await getToken(quoteAddress ?? baseToken.quoteToken ?? PATH_USD)
  const from = Math.max(-2000, Math.ceil(window.from / 10) * 10)
  const to = Math.min(2000, Math.floor(window.to / 10) * 10)
  const key = `snapshot:${baseToken.address}:${quote.address}:${from}:${to}`
  return swr(key, 4_000, async () => {
    const book = pairKey(baseToken.address, quote.address)
    const blockNumber = await client.getBlockNumber()
    const observedAt = Date.now()
    const [constants, books] = await Promise.all([getDexConstants(), client.readContract({ ...dex, functionName: 'books', args: [book], blockNumber })])
    const exists = books.base !== '0x0000000000000000000000000000000000000000'
    const bids: { tick: number; isBid: boolean }[] = []
    const asks: { tick: number; isBid: boolean }[] = []
    if (exists) {
      for (let t = Math.min(to, books.bestBidTick); hasBestBid(books.bestBidTick) && t >= from; t -= 10) bids.push({ tick: t, isBid: true })
      for (let t = Math.max(from, books.bestAskTick); hasBestAsk(books.bestAskTick) && t <= to; t += 10) asks.push({ tick: t, isBid: false })
    }
    const wanted = [...bids.slice(0, MAX_LEVELS_PER_SIDE), ...asks.slice(0, MAX_LEVELS_PER_SIDE)]
    const levels = await mapLimit(wanted, 6, ({ tick, isBid }) => readLevel(baseToken.address, tick, isBid))
    const sizes = [100n, 10_000n, 1_000_000n].map((n) => n * 10n ** BigInt(baseToken.decimals))
    const quotes: ExecutionQuote[] = exists
      ? await mapLimit(
          sizes.flatMap((amountIn) => [
            { side: 'sell_base' as const, amountIn },
            { side: 'buy_base' as const, amountIn },
          ]),
          3,
          async (q) => {
            try {
              const [tokenIn, tokenOut] = q.side === 'sell_base' ? [baseToken.address, quote.address] : [quote.address, baseToken.address]
              const amountOut = await client.readContract({ ...dex, functionName: 'quoteSwapExactAmountIn', args: [tokenIn, tokenOut, q.amountIn] })
              return { ...q, amountOut }
            } catch (error) {
              return { ...q, amountOut: null, error: describeError(error) }
            }
          },
        )
      : []
    return {
      chainId: CHAIN_ID,
      blockNumber,
      observedAt,
      source: RPC_HOST,
      bookKey: book,
      base: baseToken,
      quote,
      bestBidTick: books.bestBidTick,
      bestAskTick: books.bestAskTick,
      exists,
      levels,
      quotes,
      constants,
    }
  })
}

export type BookState = {
  chainId: number
  blockNumber: bigint
  observedAt: number
  source: string
  bookKey: Hex
  base: TokenInfo
  quote: TokenInfo
  bestBidTick: number
  bestAskTick: number
  exists: boolean
  constants: DexConstants
}

/** Fast decision input: best ticks, token state and the block they were read at. */
export async function getBookState(base: Address, quoteAddress: Address | null): Promise<BookState> {
  const baseToken = await getToken(base)
  const quote = await getToken(quoteAddress ?? baseToken.quoteToken ?? PATH_USD)
  return swr(`book:${baseToken.address}:${quote.address}`, 2_000, async () => {
    const book = pairKey(baseToken.address, quote.address)
    const blockNumber = await client.getBlockNumber()
    const [constants, books, basePaused, quotePaused] = await Promise.all([
      getDexConstants(),
      client.readContract({ ...dex, functionName: 'books', args: [book], blockNumber }),
      client.readContract({ address: baseToken.address, abi: Abis.tip20, functionName: 'paused', blockNumber }).catch(() => baseToken.paused),
      client.readContract({ address: quote.address, abi: Abis.tip20, functionName: 'paused', blockNumber }).catch(() => quote.paused),
    ])
    return {
      chainId: CHAIN_ID,
      blockNumber,
      observedAt: Date.now(),
      source: RPC_HOST,
      bookKey: book,
      base: { ...baseToken, paused: basePaused },
      quote: { ...quote, paused: quotePaused },
      bestBidTick: books.bestBidTick,
      bestAskTick: books.bestAskTick,
      exists: books.base !== '0x0000000000000000000000000000000000000000',
      constants,
    }
  }, 4_000)
}

export type OrderReading =
  | {
      orderId: bigint
      status: 'live'
      maker: Address
      bookKey: Hex
      isBid: boolean
      tick: number
      amount: bigint
      remaining: bigint
      isFlip: boolean
      flipTick: number
    }
  | { orderId: bigint; status: 'absent' }
  | { orderId: bigint; status: 'unknown'; error: string }

export async function getOrders(ids: bigint[]): Promise<{ blockNumber: bigint; observedAt: number; orders: OrderReading[] }> {
  const blockNumber = await client.getBlockNumber()
  const observedAt = Date.now()
  if (ids.length === 0) return { blockNumber, observedAt, orders: [] }
  const results = await client.multicall({
    allowFailure: true,
    blockNumber,
    contracts: ids.map((orderId) => ({ ...dex, functionName: 'getOrder' as const, args: [orderId] as const })),
  })
  const orders = results.map((r, i): OrderReading => {
    const orderId = ids[i]
    if (r.status === 'success') {
      const o = r.result
      return { orderId, status: 'live', maker: o.maker, bookKey: o.bookKey, isBid: o.isBid, tick: o.tick, amount: o.amount, remaining: o.remaining, isFlip: o.isFlip, flipTick: o.flipTick }
    }
    const reason = describeError(r.error)
    // Multicall surfaces OrderDoesNotExist as a generic revert; confirm with a direct call.
    return { orderId, status: 'unknown', error: reason }
  })
  const unresolved = orders.filter((o) => o.status === 'unknown')
  for (const o of unresolved) {
    try {
      await client.readContract({ ...dex, functionName: 'getOrder', args: [o.orderId], blockNumber })
    } catch (error) {
      const reason = describeError(error)
      const idx = orders.findIndex((x) => x.orderId === o.orderId)
      orders[idx] = reason === 'OrderDoesNotExist' ? { orderId: o.orderId, status: 'absent' } : { orderId: o.orderId, status: 'unknown', error: reason }
    }
  }
  return { blockNumber, observedAt, orders }
}

export type AccountBalances = {
  blockNumber: bigint
  observedAt: number
  tokens: { address: Address; wallet: bigint; dex: bigint }[]
}

export async function getBalances(account: Address, tokens: Address[]): Promise<AccountBalances> {
  const blockNumber = await client.getBlockNumber()
  const observedAt = Date.now()
  const calls = tokens.flatMap((token) => [
    { address: token, abi: Abis.tip20, functionName: 'balanceOf' as const, args: [account] as const },
    { ...dex, functionName: 'balanceOf' as const, args: [account, token] as const },
  ])
  const results = await client.multicall({ allowFailure: false, blockNumber, contracts: calls })
  return {
    blockNumber,
    observedAt,
    tokens: tokens.map((address, i) => ({ address, wallet: results[i * 2] as bigint, dex: results[i * 2 + 1] as bigint })),
  }
}

const ORDER_EVENTS = [
  parseAbiItem('event OrderPlaced(uint128 indexed orderId, address indexed maker, address indexed token, uint128 amount, bool isBid, int16 tick, bool isFlipOrder, int16 flipTick)'),
  parseAbiItem('event OrderFilled(uint128 indexed orderId, address indexed maker, address indexed taker, uint128 amountFilled, bool partialFill)'),
  parseAbiItem('event OrderFlipped(uint128 indexed orderId, address indexed maker, address indexed token, uint128 amount, bool isBid, int16 tick, int16 flipTick)'),
  parseAbiItem('event FlipFailed(uint128 indexed orderId, address indexed maker, bytes4 reason)'),
  parseAbiItem('event OrderCancelled(uint128 indexed orderId)'),
] as const

export type OrderEvent = {
  orderId: bigint
  event: 'OrderPlaced' | 'OrderFilled' | 'OrderFlipped' | 'FlipFailed' | 'OrderCancelled'
  blockNumber: bigint
  transactionHash: Hex
  logIndex: number
  /** Unix seconds from the block header. */
  timestamp: number | null
  args: Record<string, unknown>
}

const blockTimes = new Map<bigint, number>()
async function blockTimestamp(blockNumber: bigint): Promise<number | null> {
  const hit = blockTimes.get(blockNumber)
  if (hit !== undefined) return hit
  try {
    const block = await client.getBlock({ blockNumber })
    const t = Number(block.timestamp)
    blockTimes.set(blockNumber, t)
    return t
  } catch {
    return null
  }
}

/** Every DEX event for one order ID since it was placed, keyed for idempotent ingestion. */
export async function getOrderEvents(orderId: bigint, fromBlock: bigint): Promise<{ toBlock: bigint; events: OrderEvent[] }> {
  const toBlock = await client.getBlockNumber()
  const events: OrderEvent[] = []
  const STEP = 50_000n
  const orderTopic = pad(toHex(orderId))
  for (let start = fromBlock; start <= toBlock; start += STEP) {
    const end = start + STEP - 1n > toBlock ? toBlock : start + STEP - 1n
    const logs = await client.request({
      method: 'eth_getLogs',
      params: [{ address: DEX_ADDRESS, fromBlock: toHex(start), toBlock: toHex(end), topics: [null, orderTopic] }],
    })
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({ abi: ORDER_EVENTS, data: log.data, topics: log.topics as [Hex, ...Hex[]] })
        events.push({
          orderId,
          event: decoded.eventName,
          blockNumber: BigInt(log.blockNumber ?? 0),
          transactionHash: log.transactionHash as Hex,
          logIndex: Number(log.logIndex ?? 0),
          timestamp: null,
          args: decoded.args as Record<string, unknown>,
        })
      } catch {
        // A different DEX event sharing topic1 (e.g. PairCreated) is not an order event.
      }
    }
  }
  for (const e of events) e.timestamp = await blockTimestamp(e.blockNumber)
  return { toBlock, events }
}

/**
 * DEX events for several order IDs. Moderato's RPC rejects or silently empties
 * OR-filters on topic1, so each order is scanned on its own topic.
 */
export async function getEventsForOrders(orderIds: bigint[], fromBlock: bigint): Promise<{ toBlock: bigint; events: OrderEvent[] }> {
  const key = `events:${orderIds.join(',')}:${fromBlock}`
  return swr(key, 8_000, async () => {
    const results = await mapLimit(orderIds, 3, (id) => getOrderEvents(id, fromBlock))
    const events = results.flatMap((r) => r.events)
    events.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))
    const toBlock = results.reduce((m, r) => (r.toBlock < m ? r.toBlock : m), results[0]?.toBlock ?? 0n)
    return { toBlock, events }
  })
}

export async function getChainHead(): Promise<{ blockNumber: bigint; timestamp: bigint; observedAt: number }> {
  const block = await client.getBlock()
  return { blockNumber: block.number, timestamp: block.timestamp, observedAt: Date.now() }
}

import { getAddress, isAddress } from 'viem'
import { midTick } from '../market/book'
import { hasBestAsk, hasBestBid, snapToSpacing } from '../market/ticks'
import { CHAIN_ID, EXPLORER_URL, NETWORK_LABEL, RPC_HOST } from '../tempo/chain'
import { describeError, getBookState, getMarketSnapshot, listMarkets, type MarketSummary } from '../tempo/reads'
import { buildHealthReport } from './build'
import { marketIdFor } from './input'
import type { LiquidityHealthReport } from './types'

export const NETWORK_INFO = { chainId: CHAIN_ID, name: NETWORK_LABEL, environment: 'testnet' as const, explorer: EXPLORER_URL, rpcHost: RPC_HOST }

/** Public reports use a fixed freshness limit: an observation older than this is stale. */
export const PUBLIC_MAX_AGE_SECONDS = 30
export const DEFAULT_BAND_BPS = 10
export const MAX_BAND_BPS = 50

export type SupportedMarket = MarketSummary & { marketId: string }

/** Markets Korrin publishes reports for: the faucet-issued USD tokens quoted in PathUSD. */
export async function supportedMarkets(): Promise<{ markets: SupportedMarket[]; blockNumber: bigint; observedAt: number }> {
  const list = await listMarkets()
  return {
    markets: list.markets.filter((m) => m.canonical).map((m) => ({ ...m, marketId: marketIdFor(m.base.symbol, m.quote.symbol) })),
    blockNumber: list.blockNumber,
    observedAt: list.observedAt,
  }
}

/** Resolves `tempo-moderato:alphausd-pathusd` or a base token address to a supported market. */
export async function resolveMarket(idOrAddress: string): Promise<SupportedMarket | null> {
  const { markets } = await supportedMarkets()
  const needle = decodeURIComponent(idOrAddress).trim().toLowerCase()
  if (isAddress(needle)) return markets.find((m) => m.base.address === getAddress(needle)) ?? null
  return markets.find((m) => m.marketId === needle) ?? null
}

export function parseBand(raw: string | null): number | null {
  if (raw === null || raw === '') return DEFAULT_BAND_BPS
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= MAX_BAND_BPS ? n : null
}

/**
 * The public market report: no mandate is in scope, so nothing is attributed to an
 * owner and no private plan, balance or order of any operator can appear in it.
 */
export async function publicHealthReport(market: SupportedMarket, bandBps: number): Promise<LiquidityHealthReport> {
  const centerOf = (bid: number, ask: number) => snapToSpacing(midTick(bid, ask) ?? (hasBestBid(bid) ? bid : hasBestAsk(ask) ? ask : 0))
  let center = centerOf(market.bestBidTick, market.bestAskTick)
  const halfWidthTicks = bandBps * 10
  const base = { address: market.base.address, symbol: market.base.symbol, decimals: market.base.decimals }
  const quote = { address: market.quote.address, symbol: market.quote.symbol, decimals: market.quote.decimals }
  try {
    // Centre the band on the current book so the levels read and the band agree.
    const book = await getBookState(market.base.address, market.quote.address)
    center = centerOf(book.bestBidTick, book.bestAskTick)
    const s = await getMarketSnapshot(market.base.address, market.quote.address, { from: center - halfWidthTicks, to: center + halfWidthTicks })
    return buildHealthReport({
      network: NETWORK_INFO,
      market: { marketId: market.marketId, base, quote, bookKey: s.bookKey },
      source: 'ONCHAIN_READ',
      observation: {
        blockNumber: s.blockNumber.toString(),
        observedAtMs: s.observedAt,
        bestBidTick: s.bestBidTick,
        bestAskTick: s.bestAskTick,
        levels: s.levels.map((l) => ({ tick: l.tick, isBid: l.isBid, status: l.status, liquidity: l.liquidity === null ? null : l.liquidity.toString() })),
        tickSpacing: s.constants.tickSpacing,
      },
      maxAgeSeconds: PUBLIC_MAX_AGE_SECONDS,
      band: { centerTick: center, halfWidthTicks, basis: 'market_mid' },
    })
  } catch (error) {
    return buildHealthReport({
      network: NETWORK_INFO,
      market: { marketId: market.marketId, base, quote, bookKey: market.bookKey },
      source: 'ONCHAIN_READ',
      observation: null,
      observationError: describeError(error),
      maxAgeSeconds: PUBLIC_MAX_AGE_SECONDS,
      band: { centerTick: center, halfWidthTicks, basis: 'market_mid' },
    })
  }
}

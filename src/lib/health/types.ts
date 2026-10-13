import type { Address, Hex } from 'viem'

/**
 * Canonical Liquidity Health Report (PRD v2 §5). One implementation feeds the
 * market screen, the analyst, the public preview, the paid MPP endpoint and the
 * MCP tools, so every surface shows the same numbers for the same observation.
 */

export const HEALTH_SCHEMA_VERSION = '2.0'
export const HEALTH_METHODOLOGY_VERSION = 'korrin-health/1.0.0'

export type Quality = 'HIGH' | 'DEGRADED' | 'UNAVAILABLE'
export type Provenance = 'ONCHAIN_READ' | 'CONFIRMED_EVENT' | 'MANUAL_CONFIG' | 'RECORDED_REPLAY' | 'SIMULATION'

/**
 * A value with where it came from. `value: null` always carries `reasonIfNull`:
 * an unknown is never turned into zero. Amounts are base-unit integer strings.
 */
export type Metric<T = string> = {
  value: T | null
  unit?: string
  source: Provenance
  asOfBlock?: string
  reasonIfNull?: string
  /** Sum over the levels that could be read, when some could not. Never presented as the total. */
  lowerBound?: string
}

export type CoverageStatus = 'MET' | 'SHORT' | 'NOT_APPLICABLE' | 'UNKNOWN'
export type CoverageMetric = Metric<string> & { status: CoverageStatus; ratio: number | null }

export type InventoryBucket = {
  /** Wallet balance not held back by the reserve floor. */
  idleWallet: string
  /** Funds the DEX holds for the owner after cancels and fills; free to withdraw. */
  dexInternalFree: string
  /** Escrow of verified resting orders. Already left the wallet; never double-counted. */
  committedResting: string
  /** Part of wallet and DEX balance kept back by the plan's reserve floor. */
  reservedPolicy: string
  /** Escrow of orders whose state could not be confirmed. Excluded from everything above. */
  unreconciled: string
  /** Signed actions not yet confirmed by readback. */
  inflightActions: number
}

export type HealthLevel = { tick: number; isBid: boolean; status: 'ok' | 'unreadable'; liquidity: string | null }

export type HealthOwnOrder = {
  orderId: string
  /** From an independent getOrder readback, never from the submitting transaction alone. */
  status: 'live' | 'absent' | 'unknown' | 'pending'
  isBid: boolean
  tick: number
  flipTick: number
  remaining: string
  placedTx?: Hex
}

export type HealthMandateInput = {
  id: string
  name: string
  status: string
  version: number
  policyDigest: Hex
  owner: Address
  targetTick: number
  bandTicks: number
  quoteOffsetTicks: number
  targetBidDepth: string
  targetAskDepth: string
  reserveBase: string
  reserveQuote: string
  maxDataAgeSeconds: number
}

/** Everything the engine needs. The engine itself performs no I/O. */
export type HealthInput = {
  network: { chainId: number; name: string; environment: 'testnet' | 'mainnet'; explorer: string; rpcHost: string }
  market: { marketId: string; base: { address: Address; symbol: string; decimals: number }; quote: { address: Address; symbol: string; decimals: number }; bookKey?: Hex }
  source: Extract<Provenance, 'ONCHAIN_READ' | 'RECORDED_REPLAY'>
  observation: {
    blockNumber: string
    observedAtMs: number
    bestBidTick: number
    bestAskTick: number
    /** Levels read inside the window. Missing ticks inside the band count as unreadable. */
    levels: HealthLevel[]
    tickSpacing: number
  } | null
  /** Why there is no observation, when there is none. */
  observationError?: string
  /** Age at which the report stops being trustworthy for action. */
  maxAgeSeconds: number
  /** The price band the depth is measured in. With a mandate this is the mandate corridor. */
  band: { centerTick: number; halfWidthTicks: number; basis: 'mandate' | 'market_mid' | 'requested' }
  mandate?: HealthMandateInput
  ownOrders?: HealthOwnOrder[]
  balances?: { readAtBlock: string; base: { wallet: string; dex: string }; quote: { wallet: string; dex: string } } | null
  inflightActions?: number
  /** The deterministic planner's decision for the same observation, when a mandate is in scope. */
  decision?: { kind: string; reasonCode: string; cause: string; action: string; nextCondition: string | null }
}

export type LiquidityHealthReport = {
  schemaVersion: typeof HEALTH_SCHEMA_VERSION
  reportId: string
  network: { chainId: number; name: string; environment: 'testnet' | 'mainnet' }
  market: { marketId: string; base: string; quote: string; baseAddress: Address; quoteAddress: Address; decimals: number; bookKey?: Hex }
  window: { observedAt: string | null; block: string | null; maxAllowedAgeSeconds: number; source: Provenance; rpcHost: string }
  methodology: { version: string; policyVersion: number | null; band: { centerTick: number; halfWidthBps: number; lowTick: number; highTick: number; basis: HealthInput['band']['basis'] }; externalDataFeeds: string[] }
  quote: { bestBid: Metric; bestAsk: Metric; spreadBps: Metric; shape: 'two-sided' | 'locked' | 'crossed' | 'bids only' | 'asks only' | 'empty' | 'unknown' }
  depth: {
    levelsInBand: number
    unreadableLevelsInBand: number
    totalBid: Metric
    totalAsk: Metric
    ownBid: Metric
    ownAsk: Metric
    externalBid: Metric
    externalAsk: Metric
  }
  mandate: null | {
    id: string
    name: string
    status: string
    version: number
    policyDigest: Hex
    targetBid: string
    targetAsk: string
    coverageBid: CoverageMetric
    coverageAsk: CoverageMetric
    shortfallBid: Metric
    shortfallAsk: Metric
    decision: HealthInput['decision'] | null
  }
  inventory: null | { readAtBlock: string; base: InventoryBucket; quote: InventoryBucket }
  orders: { live: number; pending: number; unknown: number; ids: string[] }
  risk: { unreconciled: boolean; partialDepth: boolean; crossed: boolean; reasonCodes: string[] }
  quality: Quality
  qualityReasons: string[]
  disclosures: string[]
  evidence: { blockExplorerUrls: string[]; nativeOrderIds: string[]; snapshotDigest: Hex }
}

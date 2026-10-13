import { policyDigest, pickPolicy } from '../mandate/digest'
import type { LiquidityMandate } from '../mandate/types'
import type { PlanningSnapshot } from '../policy/plan'
import { mandateHealthInput, type ObservationInput } from './input'
import type { HealthLevel, HealthOwnOrder } from './types'

/** Shared test fixtures: a BetaUSD/PathUSD book with 1,000 base units per level. */
export const U = 1_000_000n
export const NOW = 1_760_000_000_000
export const NETWORK = { chainId: 42431, name: 'Tempo Moderato testnet', environment: 'testnet' as const, explorer: 'https://explore.testnet.tempo.xyz', rpcHost: 'rpc.moderato.tempo.xyz' }

export function mandate(overrides: Partial<LiquidityMandate> = {}): LiquidityMandate {
  const m: Omit<LiquidityMandate, 'policyDigest'> = {
    id: 'm1',
    name: 'Test market',
    owner: '0x5C4d371C64FC0D6f82d6E7d19597ddd23a91267B',
    chainId: 42431,
    base: { address: '0x20c0000000000000000000000000000000000002', symbol: 'BetaUSD', decimals: 6 },
    quote: { address: '0x20c0000000000000000000000000000000000000', symbol: 'PathUSD', decimals: 6 },
    bookKey: '0x1d4a3d252ac88203ffa81ba59c52543fc9bf8976382b73bdfc08bc6dc5681d32',
    targetTick: 0,
    bandTicks: 100,
    quoteOffsetTicks: 30,
    targetBidDepth: (500n * U).toString(),
    targetAskDepth: (500n * U).toString(),
    maxBaseAllocation: (2_000n * U).toString(),
    maxQuoteAllocation: (2_000n * U).toString(),
    reserveBase: (100n * U).toString(),
    reserveQuote: (100n * U).toString(),
    maxOrderAmount: (250n * U).toString(),
    maxActionsPerHour: 12,
    maxDataAgeSeconds: 30,
    maxInventoryShareBps: 7_500,
    executionMode: 'approval_required',
    status: 'active',
    version: 1,
    createdAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z',
    ...overrides,
  }
  return { ...m, policyDigest: policyDigest(pickPolicy(m)) }
}

/** Bids from −10 down to −100 and asks from 10 up to 100, 1,000 base units each unless overridden. */
export function levels(over: Record<string, Partial<HealthLevel>> = {}): HealthLevel[] {
  const out: HealthLevel[] = []
  for (let t = -10; t >= -100; t -= 10) out.push({ tick: t, isBid: true, status: 'ok', liquidity: (1_000n * U).toString(), ...over[`b${t}`] })
  for (let t = 10; t <= 100; t += 10) out.push({ tick: t, isBid: false, status: 'ok', liquidity: (1_000n * U).toString(), ...over[`a${t}`] })
  return out
}

export const observation = (o: Partial<ObservationInput> = {}): ObservationInput => ({ blockNumber: '39243765', observedAtMs: NOW - 2_000, bestBidTick: -10, bestAskTick: 10, levels: levels(), tickSpacing: 10, ...o })

export const own = (o: Partial<HealthOwnOrder> = {}): HealthOwnOrder => ({ orderId: '18439539', status: 'live', isBid: true, tick: -30, flipTick: 30, remaining: (250n * U).toString(), ...o })

export const balances = { readAtBlock: '39243765', base: { wallet: (10_000n * U).toString(), dex: '0' }, quote: { wallet: (10_000n * U).toString(), dex: '0' } }

export function input(o: Partial<Parameters<typeof mandateHealthInput>[0]> = {}) {
  return mandateHealthInput({ network: NETWORK, mandate: mandate(), source: 'ONCHAIN_READ', observation: observation(), ownOrders: [own()], balances, inflightActions: 0, proposal: null, ...o })
}

export function planningSnapshot(m: LiquidityMandate, orders: HealthOwnOrder[]): PlanningSnapshot {
  return {
    expectedChainId: 42431,
    chainId: 42431,
    marketSupported: true,
    basePaused: false,
    quotePaused: false,
    bestBidTick: -10,
    bestAskTick: 10,
    blockNumber: 39_243_765n,
    observedAtMs: NOW - 2_000,
    nowMs: NOW,
    ownOrders: orders.map((o) => ({ orderId: BigInt(o.orderId), isBid: o.isBid, tick: o.tick, flipTick: o.flipTick, remaining: BigInt(o.remaining), status: o.status === 'live' ? ('resting' as const) : ('unknown' as const) })),
    balances: { base: { wallet: 10_000n * U, dex: 0n }, quote: { wallet: 10_000n * U, dex: 0n } },
    minOrderAmount: 100n * U,
    recentActionTimestampsMs: [],
  }
}


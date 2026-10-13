import type { Address, Hex } from 'viem'

export type MandateStatus = 'draft' | 'review' | 'armed' | 'active' | 'paused' | 'unwinding' | 'closed' | 'error'

export type ExecutionMode = 'approval_required'

export type TokenRef = { address: Address; symbol: string; decimals: number }

/**
 * Application policy object. It is NOT an onchain claim: only native order state
 * and confirmed transfers are onchain. Amounts are base-unit integers serialised as
 * strings; depth targets are measured in base-token units because Tempo DEX order
 * amounts are base-denominated.
 */
export type LiquidityMandate = {
  id: string
  name: string
  owner: Address
  chainId: number
  base: TokenRef
  quote: TokenRef
  bookKey: Hex
  targetTick: number
  bandTicks: number
  quoteOffsetTicks: number
  targetBidDepth: string
  targetAskDepth: string
  maxBaseAllocation: string
  maxQuoteAllocation: string
  reserveBase: string
  reserveQuote: string
  maxOrderAmount: string
  maxActionsPerHour: number
  maxDataAgeSeconds: number
  maxInventoryShareBps: number
  executionMode: ExecutionMode
  status: MandateStatus
  version: number
  policyDigest: Hex
  createdAt: string
  updatedAt: string
}

/** The fields that define the policy. Everything the digest covers. */
export const POLICY_FIELDS = [
  'owner',
  'chainId',
  'base',
  'quote',
  'bookKey',
  'targetTick',
  'bandTicks',
  'quoteOffsetTicks',
  'targetBidDepth',
  'targetAskDepth',
  'maxBaseAllocation',
  'maxQuoteAllocation',
  'reserveBase',
  'reserveQuote',
  'maxOrderAmount',
  'maxActionsPerHour',
  'maxDataAgeSeconds',
  'maxInventoryShareBps',
  'executionMode',
  'version',
] as const satisfies readonly (keyof LiquidityMandate)[]

export type MandatePolicy = Pick<LiquidityMandate, (typeof POLICY_FIELDS)[number]>

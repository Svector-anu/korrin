import { type Hex, keccak256, toHex } from 'viem'
import { type LiquidityMandate, type MandatePolicy, POLICY_FIELDS } from './types'

/** Sorted-key JSON form with lower-cased hex, so equal content always hashes equally. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    )
  }
  if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) return value.toLowerCase()
  return value
}

export function pickPolicy(mandate: Omit<LiquidityMandate, 'policyDigest'> | LiquidityMandate): MandatePolicy {
  return Object.fromEntries(POLICY_FIELDS.map((field) => [field, mandate[field]])) as MandatePolicy
}

/** Deterministic keccak256 over the canonical JSON of the policy fields. */
export function policyDigest(policy: MandatePolicy): Hex {
  return keccak256(toHex(JSON.stringify(canonicalize(policy))))
}

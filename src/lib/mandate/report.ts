import type { Address, Hex } from 'viem'
import type { TrackedOrder } from '../client/store'
import { pickPolicy, policyDigest } from './digest'
import type { LiquidityMandate } from './types'

export type ReportOrder = Pick<TrackedOrder, 'orderId' | 'placedTx' | 'placedBlock' | 'side' | 'tick' | 'flipTick' | 'amount' | 'base' | 'chainId'>

export type ReportPayload = {
  v: 1
  mandate: LiquidityMandate
  orders: ReportOrder[]
  signedBy: Address
  signature: Hex
  issuedAt: string
}

/** The exact text the owner signs. Binds the policy digest, chain and order IDs. */
export function reportMessage(m: LiquidityMandate, orderIds: string[], issuedAt: string): string {
  return ['Korrin mandate report', `mandate ${m.id}`, `policy ${m.policyDigest}`, `chain ${m.chainId}`, `orders ${orderIds.join(',') || 'none'}`, `issued ${issuedAt}`].join('\n')
}

const toBase64Url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

export function encodeReport(p: ReportPayload): string {
  return toBase64Url(JSON.stringify(p))
}

export function decodeReport(raw: string): ReportPayload | null {
  try {
    const p = JSON.parse(fromBase64Url(raw)) as ReportPayload
    if (p.v !== 1 || !p.mandate?.policyDigest || !Array.isArray(p.orders)) return null
    return p
  } catch {
    return null
  }
}

/** True when the policy fields in the link hash to the digest the owner signed. */
export function digestMatches(m: LiquidityMandate): boolean {
  return policyDigest(pickPolicy(m)) === m.policyDigest
}

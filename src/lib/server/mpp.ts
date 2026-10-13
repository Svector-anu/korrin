import { Challenge, Credential, Expires, Receipt } from 'mppx'
import { Mppx, tempo } from 'mppx/server'
import { type Hex, isAddress, keccak256, toHex } from 'viem'
import type { LiquidityHealthReport } from '../health/types'
import { PATH_USD } from '../tempo/chain'
import { getKv, mppxStore } from './kv'

/** Price of one current market report, in PathUSD. Testnet value with no commercial meaning. */
export const DEFAULT_PRICE = '0.01'
export const CHALLENGE_TTL_MINUTES = 2
const REPORT_TTL_SECONDS = 30 * 24 * 3600
const KEY = {
  report: (id: string) => `korrin:report:${id}`,
  entitlement: (reference: string) => `korrin:ent:${reference.toLowerCase()}`,
  credential: (digest: string) => `korrin:cred:${digest}`,
}

export type PaidConfig = { secretKey: string; recipient: `0x${string}`; price: string }

/** Missing pieces block the paid route entirely; it never falls back to per-instance memory. */
export function paidApiStatus(): { enabled: boolean; missing: string[]; price: string; recipient: string | null; currency: string } {
  const missing: string[] = []
  const secret = process.env.MPP_SECRET_KEY
  const recipient = process.env.KORRIN_MPP_RECIPIENT
  if (!secret || secret.length < 32) missing.push('MPP_SECRET_KEY')
  if (!recipient || !isAddress(recipient)) missing.push('KORRIN_MPP_RECIPIENT')
  if (!getKv()) missing.push('Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN)')
  return { enabled: missing.length === 0, missing, price: process.env.KORRIN_MPP_PRICE || DEFAULT_PRICE, recipient: recipient ?? null, currency: PATH_USD }
}

let mppx: ReturnType<typeof createMppx> | null = null

function createMppx(cfg: PaidConfig) {
  const kv = getKv()
  if (!kv) throw new Error('Upstash is not configured')
  return Mppx.create({
    methods: [tempo.charge({ testnet: true, recipient: cfg.recipient, currency: PATH_USD, store: mppxStore(kv), storeKeyPrefix: 'korrin:mpp:', waitForConfirmation: true })],
    secretKey: cfg.secretKey,
  })
}

function config(): PaidConfig {
  const status = paidApiStatus()
  if (!status.enabled) throw new Error(`Paid API not configured: ${status.missing.join(', ')}`)
  return { secretKey: process.env.MPP_SECRET_KEY as string, recipient: process.env.KORRIN_MPP_RECIPIENT as `0x${string}`, price: status.price }
}

export function getMppx() {
  mppx ??= createMppx(config())
  return mppx
}

/** The charge handler for one pinned report. The report ID is bound into the challenge twice: externalId and opaque meta. */
export function chargeFor(reportId: string, marketId: string) {
  const cfg = config()
  return getMppx().charge({
    amount: cfg.price,
    externalId: reportId,
    meta: { reportId },
    description: `Korrin Liquidity Health Report ${reportId} for ${marketId} (testnet)`,
    expires: Expires.minutes(CHALLENGE_TTL_MINUTES),
  })
}

/** Stores the report before any challenge for it is issued, so the paid artifact is fixed before payment. */
export async function pinReport(report: LiquidityHealthReport): Promise<void> {
  const kv = getKv()
  if (!kv) throw new Error('Upstash is not configured')
  await kv.set(KEY.report(report.reportId), JSON.stringify(report), { nx: true, ex: REPORT_TTL_SECONDS })
}

export async function loadReport(reportId: string): Promise<LiquidityHealthReport | null> {
  if (!/^lhr_[0-9a-f]{24}$/.test(reportId)) return null
  const raw = await getKv()?.get<string>(KEY.report(reportId))
  return raw ? (JSON.parse(raw) as LiquidityHealthReport) : null
}

export type Entitlement = {
  id: string
  protocol: 'mpp'
  resourceKind: 'market_health'
  marketId: string
  reportId: string
  challengeId: string
  paymentReference: string
  method: string
  network: string
  asset: string
  amount: string
  recipient: string
  verifiedAt: string
  responseDigest: Hex
  receipt: string
  status: 'DELIVERED' | 'RETRIEVABLE'
}

/** Reads the pinned report ID out of a payment credential without trusting anything else in it. */
export function credentialFromRequest(request: Request): { credential: Credential.Credential; digest: string; reportId: string | null } | null {
  const header = request.headers.get('authorization')
  if (!header || Credential.extractPaymentScheme(header) === null) return null
  try {
    const credential = Credential.fromRequest(request)
    const reportId = Challenge.meta(credential.challenge)?.reportId ?? null
    return { credential, digest: keccak256(toHex(Credential.serialize(credential))), reportId }
  } catch {
    return null
  }
}

export async function entitlementForCredential(digest: string): Promise<Entitlement | null> {
  const kv = getKv()
  const reference = await kv?.get<string>(KEY.credential(digest))
  if (!reference || !kv) return null
  const raw = await kv.get<string>(KEY.entitlement(reference))
  return raw ? (JSON.parse(raw) as Entitlement) : null
}

export async function entitlementForReference(reference: string): Promise<Entitlement | null> {
  const raw = await getKv()?.get<string>(KEY.entitlement(reference))
  return raw ? (JSON.parse(raw) as Entitlement) : null
}

/**
 * Records one entitlement per verified payment reference. `SET NX` makes the
 * first writer win, so concurrent deliveries of the same payment converge on a
 * single grant.
 */
export async function recordEntitlement(params: { report: LiquidityHealthReport; challengeId: string; credentialDigest: string; receiptHeader: string }): Promise<Entitlement> {
  const kv = getKv()
  if (!kv) throw new Error('Upstash is not configured')
  const receipt = Receipt.deserialize(params.receiptHeader)
  const cfg = config()
  const entitlement: Entitlement = {
    id: `ent_${receipt.reference.slice(2, 18)}`,
    protocol: 'mpp',
    resourceKind: 'market_health',
    marketId: params.report.market.marketId,
    reportId: params.report.reportId,
    challengeId: params.challengeId,
    paymentReference: receipt.reference,
    method: receipt.method,
    network: 'tempo-moderato (42431)',
    asset: PATH_USD,
    amount: cfg.price,
    recipient: cfg.recipient,
    verifiedAt: receipt.timestamp,
    responseDigest: params.report.evidence.snapshotDigest,
    receipt: params.receiptHeader,
    status: 'DELIVERED',
  }
  const created = await kv.set(KEY.entitlement(receipt.reference), JSON.stringify(entitlement), { nx: true, ex: REPORT_TTL_SECONDS })
  await kv.set(KEY.credential(params.credentialDigest), receipt.reference, { ex: REPORT_TTL_SECONDS })
  if (created === 'OK') return entitlement
  return (await entitlementForReference(receipt.reference)) ?? entitlement
}

/** HMAC access token for retrieving a paid report again: `<reference>.<signature>`. */
export async function entitlementToken(e: Pick<Entitlement, 'paymentReference' | 'reportId'>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config().secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`korrin-entitlement:${e.paymentReference.toLowerCase()}:${e.reportId}`)))
  return `${e.paymentReference.toLowerCase()}.${Buffer.from(sig).toString('base64url')}`
}

export async function verifyEntitlementToken(token: string, reportId: string): Promise<Entitlement | null> {
  const [reference] = token.split('.')
  if (!reference || !/^0x[0-9a-f]{64}$/.test(reference)) return null
  const entitlement = await entitlementForReference(reference)
  if (!entitlement || entitlement.reportId !== reportId) return null
  const expected = await entitlementToken(entitlement)
  if (expected.length !== token.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i)
  return diff === 0 ? entitlement : null
}

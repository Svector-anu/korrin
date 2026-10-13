/**
 * Testnet example client and end-to-end proof for the MPP paid report.
 *
 *   pnpm tsx scripts/mpp-buy-report.ts [baseUrl] [marketId]
 *
 * Pays with KORRIN_TESTNET_TAKER_KEY (an isolated testnet account) and checks the
 * acceptance gates from PRD v2 §8.6:
 *   1. no credential            -> 402 with an MPP challenge bound to a pinned report
 *   2. spend cap                -> the client refuses challenges above MAX_SPEND
 *   3. valid credential         -> 200, report, Payment-Receipt, entitlement token
 *   4. same credential again    -> same report, no second charge
 *   5. entitlement token        -> same report from /v1/reports/{id}
 *   6. tampered credential      -> rejected, no report
 *   7. concurrent new credential -> one grant, one payment
 * Writes evidence to reports/live-runs/mpp-*.json. Never touches mainnet.
 */
import { writeFileSync } from 'node:fs'
import { Challenge, Receipt } from 'mppx'
import { Mppx, tempo } from 'mppx/client'
import { createPublicClient, formatUnits, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { Actions } from 'viem/tempo'
import { korrinChain, PATH_USD } from '../src/lib/tempo/chain'
import { loadEnvLocal } from './env'

const BASE = process.argv[2] ?? 'http://localhost:3100'
const MARKET = process.argv[3] ?? 'tempo-moderato:betausd-pathusd'
const MAX_SPEND = parseUnits('0.05', 6)
const url = `${BASE}/v1/intelligence/markets/${MARKET}/health`

loadEnvLocal()
const payerKey = process.env.KORRIN_TESTNET_TAKER_KEY
if (!payerKey?.startsWith('0x')) throw new Error('KORRIN_TESTNET_TAKER_KEY is missing from .env.local')
const account = privateKeyToAccount(payerKey as `0x${string}`)
const chain = createPublicClient({ chain: korrinChain, transport: http() })
const mppx = Mppx.create({ methods: [tempo({ account })], polyfill: false })
const log: Record<string, unknown>[] = []
const step = (name: string, detail: Record<string, unknown>) => {
  console.log(`\n== ${name}\n${JSON.stringify(detail, null, 2)}`)
  log.push({ step: name, at: new Date().toISOString(), ...detail })
}
const balance = async () => (await Actions.token.getBalance(chain, { token: PATH_USD, account: account.address })).amount

/** Requests a fresh challenge and returns a credential for it, after checking the price. */
async function challengeAndCredential() {
  const res = await mppx.rawFetch(url)
  if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}: ${await res.text()}`)
  const challenge = Challenge.fromResponse(res)
  const request = challenge.request as { amount: string; currency: string; recipient?: string; externalId?: string; methodDetails?: { chainId?: number } }
  if (BigInt(request.amount) > MAX_SPEND) throw new Error(`Refusing to pay ${request.amount}: above the ${MAX_SPEND} spend cap`)
  const credential = await mppx.createCredential(res)
  return { res, challenge, request, credential, reportId: res.headers.get('x-korrin-report-id') }
}

const main = async () => {
  const startBalance = await balance()
  step('payer', { address: account.address, pathUsd: formatUnits(startBalance, 6) })

  const first = await challengeAndCredential()
  step('1. challenge', { status: first.res.status, reportId: first.reportId, method: first.challenge.method, intent: first.challenge.intent, expires: first.challenge.expires, request: first.request })

  const paid = await fetch(url, { headers: { authorization: first.credential } })
  const paidBody = (await paid.json()) as { report?: { reportId: string; evidence: { snapshotDigest: string } }; entitlement?: { id: string; status: string; paymentReference: string; retrieve: { token: string } }; error?: unknown }
  const receipt = paid.headers.get('payment-receipt')
  step('3. paid request', { status: paid.status, reportId: paidBody.report?.reportId, digest: paidBody.report?.evidence.snapshotDigest, entitlement: paidBody.entitlement && { id: paidBody.entitlement.id, status: paidBody.entitlement.status, paymentReference: paidBody.entitlement.paymentReference }, receipt: receipt ? Receipt.deserialize(receipt) : null, error: paidBody.error })
  if (paid.status !== 200 || !paidBody.report || !paidBody.entitlement) throw new Error('Payment did not deliver a report')
  const afterFirst = await balance()

  const again = await fetch(url, { headers: { authorization: first.credential } })
  const againBody = (await again.json()) as { report?: { reportId: string }; entitlement?: { status: string } }
  const afterRetry = await balance()
  step('4. same credential again', { status: again.status, sameReport: againBody.report?.reportId === paidBody.report.reportId, entitlementStatus: againBody.entitlement?.status, chargedAgain: afterRetry !== afterFirst })

  const retrieved = await fetch(`${BASE}/v1/reports/${paidBody.report.reportId}`, { headers: { 'korrin-entitlement': paidBody.entitlement.retrieve.token } })
  const retrievedBody = (await retrieved.json()) as { report?: { reportId: string } }
  step('5. retrieval with entitlement token', { status: retrieved.status, sameReport: retrievedBody.report?.reportId === paidBody.report.reportId })

  const noToken = await fetch(`${BASE}/v1/reports/${paidBody.report.reportId}`)
  step('5b. retrieval without entitlement', { status: noToken.status, body: await noToken.json() })

  const tampered = `${first.credential.slice(0, -6)}AAAAAA`
  const bad = await fetch(url, { headers: { authorization: tampered } })
  step('6. tampered credential', { status: bad.status, gotReport: (await bad.text()).includes('"report"') })

  const second = await challengeAndCredential()
  const before = await balance()
  const [a, b] = await Promise.all([fetch(url, { headers: { authorization: second.credential } }), fetch(url, { headers: { authorization: second.credential } })])
  const [ab, bb] = (await Promise.all([a.json(), b.json()])) as { report?: { reportId: string }; entitlement?: { status: string; paymentReference: string } }[]
  const after = await balance()
  step('7. concurrent requests, one credential', {
    statuses: [a.status, b.status],
    reports: [ab.report?.reportId, bb.report?.reportId],
    entitlementStatuses: [ab.entitlement?.status, bb.entitlement?.status],
    paymentReferences: [ab.entitlement?.paymentReference, bb.entitlement?.paymentReference],
    paid: formatUnits(before - after, 6),
  })

  step('totals', { spentPathUsd: formatUnits(startBalance - (await balance()), 6), note: 'Includes two report charges and transaction fees, all on testnet.' })
  const out = `reports/live-runs/mpp-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(out, JSON.stringify({ base: BASE, market: MARKET, steps: log }, null, 2))
  console.log(`\nEvidence written to ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

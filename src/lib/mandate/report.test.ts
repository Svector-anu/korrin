import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyMessage } from 'viem'
import { defaultDraft, draftToMandate } from './draft'
import { decodeReport, digestMatches, encodeReport, reportMessage } from './report'

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const mandate = draftToMandate(defaultDraft('BetaUSD/PathUSD', 0), {
  id: 'r1',
  owner: account.address,
  chainId: 42431,
  base: { address: '0x20c0000000000000000000000000000000000002', symbol: 'BetaUSD', decimals: 6 },
  quote: { address: '0x20c0000000000000000000000000000000000000', symbol: 'PathUSD', decimals: 6 },
  bookKey: '0x1d4a3d252ac88203ffa81ba59c52543fc9bf8976382b73bdfc08bc6dc5681d32',
  targetTick: 0,
  status: 'active',
  createdAt: '2026-10-12T00:00:00Z',
})

describe('mandate report link', () => {
  it('round-trips and verifies the owner signature', async () => {
    // #given
    const issuedAt = '2026-10-12T06:00:00Z'
    const message = reportMessage(mandate, ['18439342'], issuedAt)
    const signature = await account.signMessage({ message })
    // #when
    const decoded = decodeReport(encodeReport({ v: 1, mandate, orders: [], signedBy: account.address, signature, issuedAt }))
    // #then
    expect(decoded).not.toBeNull()
    expect(await verifyMessage({ address: account.address, message: reportMessage(decoded!.mandate, ['18439342'], issuedAt), signature })).toBe(true)
  })

  it('detects a tampered policy', () => {
    expect(digestMatches(mandate)).toBe(true)
    expect(digestMatches({ ...mandate, bandTicks: 500 })).toBe(false)
  })

  it('rejects garbage', () => {
    expect(decodeReport('not-a-report')).toBeNull()
  })
})

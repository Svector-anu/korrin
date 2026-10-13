/**
 * Milestone 1 live slice against Tempo testnet (Moderato, chain 42431):
 * fund → placeFlip → receipt → orderId → independent getOrder → cancel → verify absent.
 *
 * Uses an isolated, generated testnet key from .env.local. Writes a JSON evidence
 * record to reports/live-runs/ and never touches mainnet.
 *
 *   pnpm tsx scripts/live-slice.ts [--side buy|sell] [--keep]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Address,
  type Hex,
  BaseError,
  ContractFunctionRevertedError,
  createClient,
  formatUnits,
  http,
  publicActions,
  walletActions,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { Actions, Addresses, Tick } from 'viem/tempo'
import { loadEnvLocal } from './env'

const PATH_USD: Address = '0x20c0000000000000000000000000000000000000'
const BETA_USD: Address = '0x20c0000000000000000000000000000000000002'
const DECIMALS = 6
const ORDER_AMOUNT = 100_000_000n // 100 BetaUSD, equal to the live MIN_ORDER_AMOUNT

const args = process.argv.slice(2)
const side: 'buy' | 'sell' = args.includes('--side') ? (args[args.indexOf('--side') + 1] as 'buy' | 'sell') : 'buy'
const keepOpen = args.includes('--keep')

loadEnvLocal()
const privateKey = process.env.KORRIN_TESTNET_PRIVATE_KEY as Hex | undefined
if (!privateKey) throw new Error('KORRIN_TESTNET_PRIVATE_KEY missing from .env.local')

const account = privateKeyToAccount(privateKey)
const chain = tempoModerato.extend({ feeToken: PATH_USD })
const client = createClient({ account, chain, transport: http(undefined, { timeout: 20_000, retryCount: 1 }) }).extend(publicActions).extend(walletActions)

const fmt = (v: bigint) => formatUnits(v, DECIMALS)
const now = () => performance.now()

type Step = { step: string; at: string; ms: number; detail?: unknown }
const steps: Step[] = []
const t0 = now()
const record = (step: string, detail?: unknown) => {
  const s = { step, at: new Date().toISOString(), ms: Math.round(now() - t0), detail }
  steps.push(s)
  console.log(`[${String(s.ms).padStart(6)}ms] ${step}`, detail ?? '')
}

const balances = async () => ({
  wallet: {
    PathUSD: (await Actions.token.getBalance(client, { token: PATH_USD, account: account.address })).formatted,
    BetaUSD: (await Actions.token.getBalance(client, { token: BETA_USD, account: account.address })).formatted,
  },
  dexInternal: {
    PathUSD: fmt(await Actions.dex.getBalance(client, { token: PATH_USD, account: account.address })),
    BetaUSD: fmt(await Actions.dex.getBalance(client, { token: BETA_USD, account: account.address })),
  },
})

// getTickLevel on some empty levels exhausts precompile gas on Moderato; record instead of aborting.
const readLevel = async (tick: number, isBid: boolean) => {
  try {
    return await Actions.dex.getTickLevel(client, { base: BETA_USD, tick, isBid })
  } catch (error) {
    return { unreadable: decodeRevert(error) }
  }
}

const decodeRevert = (error: unknown) => {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.shortMessage
    return error.shortMessage
  }
  return String(error)
}

const main = async () => {
  record('signer', { address: account.address, chainId: await client.getChainId() })

  let before = await balances()
  if (Number(before.wallet.PathUSD) < 500 || Number(before.wallet.BetaUSD) < 500) {
    const hashes = await Actions.faucet.fund(client, { account: account.address })
    record('faucet.fund submitted', { hashes })
    for (const hash of hashes) await client.waitForTransactionReceipt({ hash })
    record('faucet.fund confirmed')
    before = await balances()
  }
  record('balances.before', before)

  const book = await Actions.dex.getOrderbook(client, { base: BETA_USD, quote: PATH_USD })
  record('book.observed', book)

  // Rest one level outside the current touch so this proof order is not taken immediately.
  const tick = side === 'buy' ? -30 : 30
  const flipTick = side === 'buy' ? 30 : -30
  record('tickLevel.before', { tick, price: Tick.toPrice(tick), ...(await readLevel(tick, side === 'buy')) })

  const placeHash = await Actions.dex.placeFlip(client, {
    token: BETA_USD,
    amount: ORDER_AMOUNT,
    type: side,
    tick,
    flipTick,
  })
  record('placeFlip.submitted', { hash: placeHash })

  const placeReceipt = await client.waitForTransactionReceipt({ hash: placeHash })
  record('placeFlip.included', { status: placeReceipt.status, block: placeReceipt.blockNumber })
  if (placeReceipt.status !== 'success') throw new Error('placeFlip reverted')

  const placed = Actions.dex.placeFlip.extractEvent(placeReceipt.logs)
  const orderId = placed.args.orderId
  record('OrderPlaced.decoded', { ...placed.args, logIndex: placed.logIndex })

  const readback = await Actions.dex.getOrder(client, { orderId, blockNumber: placeReceipt.blockNumber })
  const latest = await Actions.dex.getOrder(client, { orderId })
  const checks = {
    makerMatches: readback.maker.toLowerCase() === account.address.toLowerCase(),
    sideMatches: readback.isBid === (side === 'buy'),
    tickMatches: readback.tick === tick,
    flipTickMatches: readback.flipTick === flipTick,
    isFlip: readback.isFlip,
    remainingMatches: readback.remaining === ORDER_AMOUNT,
  }
  record('getOrder.readback', { atBlock: placeReceipt.blockNumber, order: readback, latest, checks })
  if (!Object.values(checks).every(Boolean)) throw new Error('Readback did not match the submitted order')

  record('tickLevel.after', await readLevel(tick, side === 'buy'))
  record('balances.resting', await balances())

  if (keepOpen) {
    record('kept open', { orderId })
    return finish({ orderId, placeHash, placeBlock: placeReceipt.blockNumber, tick, flipTick })
  }

  const cancelHash = await Actions.dex.cancel(client, { orderId })
  record('cancel.submitted', { hash: cancelHash })
  const cancelReceipt = await client.waitForTransactionReceipt({ hash: cancelHash })
  record('cancel.included', { status: cancelReceipt.status, block: cancelReceipt.blockNumber })
  const cancelled = Actions.dex.cancel.extractEvent(cancelReceipt.logs)
  record('OrderCancelled.decoded', { ...cancelled.args, logIndex: cancelled.logIndex })

  let postcondition: string
  try {
    const stillThere = await Actions.dex.getOrder(client, { orderId })
    postcondition = `UNEXPECTED: order still readable (remaining ${stillThere.remaining})`
  } catch (error) {
    postcondition = decodeRevert(error)
  }
  record('getOrder.afterCancel', { result: postcondition })
  if (postcondition !== 'OrderDoesNotExist') throw new Error(`Cancel postcondition failed: ${postcondition}`)

  record('tickLevel.afterCancel', await readLevel(tick, side === 'buy'))
  record('balances.after', await balances())

  return finish({
    orderId,
    placeHash,
    placeBlock: placeReceipt.blockNumber,
    cancelHash,
    cancelBlock: cancelReceipt.blockNumber,
    tick,
    flipTick,
  })
}

const finish = (summary: Record<string, unknown>) => {
  const dir = join(process.cwd(), 'reports', 'live-runs')
  mkdirSync(dir, { recursive: true })
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const out = {
    runId,
    network: { name: chain.name, chainId: chain.id, rpc: chain.rpcUrls.default.http[0], explorer: chain.blockExplorers?.default.url },
    sdk: { viem: '2.57.4' },
    dex: Addresses.stablecoinDex,
    pair: { base: BETA_USD, quote: PATH_USD },
    side,
    amount: ORDER_AMOUNT.toString(),
    summary,
    steps,
  }
  const file = join(dir, `${runId}.json`)
  writeFileSync(file, JSON.stringify(out, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
  console.log(`\nEvidence written to ${file}`)
}

main().catch((error) => {
  record('FAILED', { error: decodeRevert(error) })
  console.error(error)
  process.exit(1)
})

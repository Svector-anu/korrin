/**
 * Exercises the full flip lifecycle on Moderato with real transactions:
 * maker places a flip bid at the top of the AlphaUSD book, a second Korrin-owned
 * testnet account sells into it, and we verify OrderFilled → OrderFlipped with the
 * SAME order ID via getOrder. Then the taker buys it back to flip it again, and the
 * maker cancels.
 *
 * The taker is our own account. This is self-generated flow to exercise protocol
 * behaviour, not external market demand, and is labelled that way in the evidence.
 *
 *   pnpm tsx scripts/flip-proof.ts
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Address,
  type Hex,
  type Log,
  BaseError,
  createClient,
  http,
  parseEventLogs,
  publicActions,
  walletActions,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { Abis, Actions, Tick } from 'viem/tempo'
import { loadEnvLocal } from './env'

const PATH_USD: Address = '0x20c0000000000000000000000000000000000000'
const ALPHA_USD: Address = '0x20c0000000000000000000000000000000000001'
const AMOUNT = 100_000_000n

loadEnvLocal()
if (!process.env.KORRIN_TESTNET_TAKER_KEY) {
  const key = generatePrivateKey()
  appendFileSync('.env.local', `# Second isolated testnet account used only to take Korrin's own proof orders\nKORRIN_TESTNET_TAKER_KEY=${key}\n`)
  process.env.KORRIN_TESTNET_TAKER_KEY = key
}

const chain = tempoModerato.extend({ feeToken: PATH_USD })
const transport = http(undefined, { timeout: 20_000, retryCount: 1 })
const makerAccount = privateKeyToAccount(process.env.KORRIN_TESTNET_PRIVATE_KEY as Hex)
const takerAccount = privateKeyToAccount(process.env.KORRIN_TESTNET_TAKER_KEY as Hex)
const maker = createClient({ account: makerAccount, chain, transport }).extend(publicActions).extend(walletActions)
const taker = createClient({ account: takerAccount, chain, transport }).extend(publicActions).extend(walletActions)

type Step = { step: string; at: string; ms: number; detail?: unknown }
const steps: Step[] = []
const t0 = performance.now()
const record = (step: string, detail?: unknown) => {
  const s = { step, at: new Date().toISOString(), ms: Math.round(performance.now() - t0), detail }
  steps.push(s)
  console.log(`[${String(s.ms).padStart(6)}ms] ${step}`, detail ?? '')
}

const dexEvents = (logs: Log[]) =>
  parseEventLogs({ abi: Abis.stablecoinDex, logs }).map((l) => ({ event: l.eventName, logIndex: l.logIndex, args: l.args }))

const ensureFunded = async (address: Address, label: string) => {
  const balance = await Actions.token.getBalance(maker, { token: ALPHA_USD, account: address })
  if (balance.amount >= 1_000n * 1_000_000n) return
  const hashes = await Actions.faucet.fund(maker, { account: address })
  for (const hash of hashes) await maker.waitForTransactionReceipt({ hash })
  record(`faucet.fund ${label}`, { address, hashes })
}

const main = async () => {
  record('accounts', { maker: makerAccount.address, taker: takerAccount.address, takerRole: 'korrin-owned test taker' })
  await ensureFunded(makerAccount.address, 'maker')
  await ensureFunded(takerAccount.address, 'taker')

  const book = await Actions.dex.getOrderbook(maker, { base: ALPHA_USD, quote: PATH_USD })
  record('book.observed', book)
  const tick = book.bestBidTick + 10
  const flipTick = book.bestAskTick - 10
  if (!(tick < flipTick)) throw new Error(`No room inside the spread: bid ${book.bestBidTick}, ask ${book.bestAskTick}`)

  const placeHash = await Actions.dex.placeFlip(maker, { token: ALPHA_USD, amount: AMOUNT, type: 'buy', tick, flipTick })
  record('placeFlip.submitted', { hash: placeHash, tick, price: Tick.toPrice(tick), flipTick, flipPrice: Tick.toPrice(flipTick) })
  const placeReceipt = await maker.waitForTransactionReceipt({ hash: placeHash })
  const orderId = Actions.dex.placeFlip.extractEvent(placeReceipt.logs).args.orderId
  record('placeFlip.included', { block: placeReceipt.blockNumber, orderId, events: dexEvents(placeReceipt.logs) })
  record('getOrder.afterPlace', await Actions.dex.getOrder(maker, { orderId }))

  const sellHash = await Actions.dex.sell(taker, { tokenIn: ALPHA_USD, tokenOut: PATH_USD, amountIn: AMOUNT, minAmountOut: 0n })
  record('taker.sell.submitted', { hash: sellHash })
  const sellReceipt = await taker.waitForTransactionReceipt({ hash: sellHash })
  const sellEvents = dexEvents(sellReceipt.logs)
  record('taker.sell.included', { block: sellReceipt.blockNumber, status: sellReceipt.status, events: sellEvents })

  const afterFlip = await Actions.dex.getOrder(maker, { orderId })
  record('getOrder.afterFlip1', {
    order: afterFlip,
    checks: {
      sameOrderId: afterFlip.orderId === orderId,
      nowAsk: afterFlip.isBid === false,
      atFlipTick: afterFlip.tick === flipTick,
      flipTickNowOriginalTick: afterFlip.flipTick === tick,
    },
  })

  const buyHash = await Actions.dex.buy(taker, { tokenIn: PATH_USD, tokenOut: ALPHA_USD, amountOut: afterFlip.remaining, maxAmountIn: afterFlip.remaining * 2n })
  record('taker.buy.submitted', { hash: buyHash })
  const buyReceipt = await taker.waitForTransactionReceipt({ hash: buyHash })
  record('taker.buy.included', { block: buyReceipt.blockNumber, status: buyReceipt.status, events: dexEvents(buyReceipt.logs) })
  record('getOrder.afterFlip2', await Actions.dex.getOrder(maker, { orderId }))

  const cancelHash = await Actions.dex.cancel(maker, { orderId })
  const cancelReceipt = await maker.waitForTransactionReceipt({ hash: cancelHash })
  record('cancel.included', { hash: cancelHash, block: cancelReceipt.blockNumber, events: dexEvents(cancelReceipt.logs) })
  try {
    await Actions.dex.getOrder(maker, { orderId })
    record('getOrder.afterCancel', { result: 'UNEXPECTED: still exists' })
  } catch (error) {
    record('getOrder.afterCancel', { result: error instanceof BaseError ? error.shortMessage : String(error) })
  }

  const dir = join(process.cwd(), 'reports', 'live-runs')
  mkdirSync(dir, { recursive: true })
  const runId = `flip-${new Date().toISOString().replace(/[:.]/g, '-')}`
  writeFileSync(
    join(dir, `${runId}.json`),
    JSON.stringify(
      {
        runId,
        kind: 'flip-lifecycle',
        disclosure: 'Fills were executed by a second Korrin-owned testnet account to exercise the flip lifecycle. They are not external market demand.',
        network: { chainId: chain.id, rpc: chain.rpcUrls.default.http[0], explorer: chain.blockExplorers?.default.url },
        pair: { base: ALPHA_USD, quote: PATH_USD },
        orderId,
        steps,
      },
      (_, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    ),
  )
  console.log(`\nEvidence written to reports/live-runs/${runId}.json`)
}

main().catch((error) => {
  record('FAILED', { error: error instanceof BaseError ? `${error.shortMessage} ${error.details ?? ''}` : String(error) })
  process.exit(1)
})

'use client'

import { type Address, type Hex, BaseError, ContractFunctionRevertedError, createClient, http, publicActions } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { signMessage } from 'viem/actions'
import { Actions } from 'viem/tempo'
import type { LiquidityMandate } from '../mandate/types'
import { formatTickPrice } from '../market/ticks'
import type { CandidateOrder } from '../policy/plan'
import { CHAIN_ID, korrinChain } from '../tempo/chain'
import { formatAmount } from '../units'
import { type ExecutionSigner, getExecutionSigner, readClient } from './signer'
import { requestRefresh } from './data'
import { closeOrder, patchAction, recordAction, setSigner, trackOrder } from './store'

/**
 * Execution authority lives here, in the operator's browser. The key is a
 * testnet-only secp256k1 key generated and stored in this browser; Korrin's server
 * never sees it and exposes no signing endpoint.
 */
export function createTestnetSigner(): Address {
  const privateKey = generatePrivateKey()
  const address = privateKeyToAccount(privateKey).address
  setSigner({ address, privateKey, createdAt: new Date().toISOString() })
  recordAction({ kind: 'create', stage: 'recorded', summary: `Created testnet signer ${address.slice(0, 6)}…${address.slice(-4)} in this browser` })
  return address
}

function executor() {
  const signer = getExecutionSigner()
  if (!signer) throw new ExecutionError('No signer', 'Connect a wallet or create a Korrin testnet signer before submitting transactions.')
  return signer
}

export class ExecutionError extends Error {
  constructor(
    public readonly title: string,
    public readonly reason: string,
  ) {
    super(`${title}: ${reason}`)
  }
}

const TRANSIENT = /no healthy upstreams|rate limited|timed out|took too long|fetch failed|HTTP request failed|503|502/i

export function isTransient(error: unknown): boolean {
  const text = error instanceof BaseError ? `${error.shortMessage} ${(error as BaseError & { details?: string }).details ?? ''}` : String(error)
  return TRANSIENT.test(text)
}

export function explainError(error: unknown): { title: string; reason: string } {
  if (error instanceof ExecutionError) return { title: error.title, reason: error.reason }
  if (isTransient(error)) {
    const detail = error instanceof BaseError ? ((error as BaseError & { details?: string }).details ?? error.shortMessage) : String(error)
    return { title: 'Tempo RPC temporarily unavailable', reason: `The testnet RPC answered "${detail.slice(0, 80)}". If this happened before a hash appeared, nothing was submitted. Try again in a moment.` }
  }
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    const details = (error as BaseError & { details?: string }).details ?? ''
    if (details.includes('InsufficientBalance')) return { title: 'Insufficient balance', reason: 'The signer does not hold enough of the token this order escrows. Fund it from the testnet faucet and try again.' }
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
      const name = revert.data.errorName
      const map: Record<string, string> = {
        BelowMinimumOrderSize: 'The DEX rejects orders below its minimum size.',
        InvalidTick: 'The tick is not on the DEX price grid.',
        InvalidFlipTick: 'The flip tick must sit on the other side of the order tick.',
        OrderDoesNotExist: 'The DEX has no order with this ID. It may already be cancelled or fully filled.',
        Unauthorized: 'Only the order maker can do this.',
        PairDoesNotExist: 'This pair has no book on the DEX.',
      }
      return { title: `DEX rejected the transaction (${name})`, reason: map[name] ?? details ?? error.shortMessage }
    }
    return { title: 'Transaction failed', reason: details || error.shortMessage }
  }
  return { title: 'Unexpected error', reason: error instanceof Error ? error.message : String(error) }
}

export type Stage = 'signing' | 'submitted' | 'included' | 'verifying' | 'confirmed' | 'failed' | 'unknown'
export type StageUpdate = { stage: Stage; at: number; txHash?: Hex; block?: bigint; detail?: string }

type OrderReadback =
  | { orderId: string; status: 'live'; maker: Address; isBid: boolean; tick: number; flipTick: number; remaining: string; amount: string; isFlip: boolean }
  | { orderId: string; status: 'absent' }
  | { orderId: string; status: 'unknown'; error: string }

/** Independent readback through Korrin's read service, not the submitting client. */
export async function readOrders(ids: string[]): Promise<{ blockNumber: string; observedAt: number; orders: OrderReadback[] }> {
  const res = await fetch(`/api/orders?ids=${ids.join(',')}`, { cache: 'no-store' })
  const body = await res.json()
  if (!res.ok) throw new ExecutionError('Readback unavailable', body.error ?? 'Korrin could not read order state from Tempo.')
  return body
}

async function assertChain(signer: ExecutionSigner) {
  const [walletChain, rpcChain] = await Promise.all([signer.write.request({ method: 'eth_chainId' }).then((v) => Number(v)), readClient.getChainId()])
  if (walletChain !== CHAIN_ID || rpcChain !== CHAIN_ID) {
    throw new ExecutionError('Wrong network', `The signer is on chain ${walletChain}. Korrin only signs on Tempo Moderato (${CHAIN_ID}). Switch networks in your wallet and review again.`)
  }
}

export async function placeMandateOrder(
  mandate: LiquidityMandate,
  order: CandidateOrder,
  meta: { reasonCode: string; expiresAtMs: number },
  onStage: (u: StageUpdate) => void,
): Promise<{ orderId: string; txHash: Hex }> {
  const sideLabel = order.side === 'buy' ? 'bid' : 'ask'
  const actionId = recordAction({
    mandateId: mandate.id,
    kind: 'place',
    stage: 'signing',
    reasonCode: meta.reasonCode,
    summary: `Place flip ${sideLabel} for ${formatAmount(order.amount, mandate.base.decimals)} ${mandate.base.symbol} at ${formatTickPrice(order.tick)}`,
  })
  const stage = (u: Omit<StageUpdate, 'at'>) => {
    onStage({ ...u, at: Date.now() })
    if (u.stage === 'confirmed' || u.stage === 'failed' || u.stage === 'unknown' || u.stage === 'included') requestRefresh()
    patchAction(actionId, { stage: u.stage, txHash: u.txHash, block: u.block?.toString(), readback: u.stage === 'confirmed' ? u.detail : undefined, error: u.stage === 'failed' || u.stage === 'unknown' ? u.detail : undefined })
  }
  try {
    if (Date.now() > meta.expiresAtMs) throw new ExecutionError('This order is out of date', 'The book read behind it is older than your freshness limit. Refresh and review again.')
    if (mandate.status === 'paused' || mandate.status === 'closed') throw new ExecutionError('Market not active', 'Paused or closed markets can’t place orders.')
    const signer = executor()
    stage({ stage: 'signing' })
    await assertChain(signer)
    const txHash = await Actions.dex.placeFlip(signer.write, { token: mandate.base.address, amount: order.amount, type: order.side, tick: order.tick, flipTick: order.flipTick })
    stage({ stage: 'submitted', txHash })
    const receipt = await readClient.waitForTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'success') throw new ExecutionError('Transaction reverted', `Included in block ${receipt.blockNumber} but reverted. No order was created.`)
    const placed = Actions.dex.placeFlip.extractEvent(receipt.logs)
    const orderId = placed.args.orderId.toString()
    stage({ stage: 'included', txHash, block: receipt.blockNumber, detail: `OrderPlaced ${orderId}` })
    patchAction(actionId, { orderId })
    trackOrder({
      chainId: CHAIN_ID,
      orderId,
      mandateId: mandate.id,
      base: mandate.base.address,
      side: order.side,
      tick: order.tick,
      flipTick: order.flipTick,
      amount: order.amount.toString(),
      placedTx: txHash,
      placedBlock: receipt.blockNumber.toString(),
      placedAt: new Date().toISOString(),
    })
    stage({ stage: 'verifying', txHash, block: receipt.blockNumber })
    const readback = await readOrders([orderId])
    const o = readback.orders[0]
    if (o?.status !== 'live') {
      stage({ stage: 'unknown', txHash, block: receipt.blockNumber, detail: `The receipt shows order ${orderId}, but reading it back at block ${readback.blockNumber} returned ${o?.status ?? 'nothing'}.` })
      return { orderId, txHash }
    }
    const matches = o.maker.toLowerCase() === signer.address.toLowerCase() && o.isBid === (order.side === 'buy') && o.tick === order.tick && o.flipTick === order.flipTick && o.isFlip
    if (!matches) {
      stage({ stage: 'unknown', txHash, block: receipt.blockNumber, detail: `Order ${orderId} reads back with different parameters than you signed.` })
      return { orderId, txHash }
    }
    stage({ stage: 'confirmed', txHash, block: receipt.blockNumber, detail: `getOrder(${orderId}) at block ${readback.blockNumber}: ${o.isBid ? 'bid' : 'ask'} at ${formatTickPrice(o.tick, 5)}, ${formatAmount(BigInt(o.remaining), mandate.base.decimals)} ${mandate.base.symbol} left` })
    return { orderId, txHash }
  } catch (error) {
    const e = explainError(error)
    stage({ stage: 'failed', detail: `${e.title}. ${e.reason}` })
    throw new ExecutionError(e.title, e.reason)
  }
}

export async function cancelMandateOrder(mandateId: string, orderId: string, onStage: (u: StageUpdate) => void): Promise<void> {
  const actionId = recordAction({ mandateId, kind: 'cancel', stage: 'signing', orderId, summary: `Cancel order ${orderId}` })
  const stage = (u: Omit<StageUpdate, 'at'>) => {
    onStage({ ...u, at: Date.now() })
    if (u.stage === 'confirmed' || u.stage === 'failed' || u.stage === 'unknown' || u.stage === 'included') requestRefresh()
    patchAction(actionId, { stage: u.stage, txHash: u.txHash, block: u.block?.toString(), readback: u.stage === 'confirmed' ? u.detail : undefined, error: u.stage === 'failed' || u.stage === 'unknown' ? u.detail : undefined })
  }
  try {
    const signer = executor()
    stage({ stage: 'signing' })
    await assertChain(signer)
    const txHash = await Actions.dex.cancel(signer.write, { orderId: BigInt(orderId) })
    stage({ stage: 'submitted', txHash })
    const receipt = await readClient.waitForTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'success') throw new ExecutionError('Cancel reverted', `Included in block ${receipt.blockNumber} but reverted. The order may still be resting.`)
    stage({ stage: 'included', txHash, block: receipt.blockNumber })
    stage({ stage: 'verifying', txHash, block: receipt.blockNumber })
    const readback = await readOrders([orderId])
    const o = readback.orders[0]
    if (o?.status === 'absent') {
      closeOrder(orderId, 'cancelled')
      stage({ stage: 'confirmed', txHash, block: receipt.blockNumber, detail: `getOrder(${orderId}) returns OrderDoesNotExist at block ${readback.blockNumber}. Its funds are in your DEX balance until you withdraw.` })
      return
    }
    stage({ stage: 'unknown', txHash, block: receipt.blockNumber, detail: `The cancel went through, but reading the order back returned ${o?.status ?? 'nothing'}. Treat it as unresolved.` })
  } catch (error) {
    const e = explainError(error)
    stage({ stage: 'failed', detail: `${e.title}. ${e.reason}` })
    throw new ExecutionError(e.title, e.reason)
  }
}

export async function withdrawDexBalance(token: Address, symbol: string, amount: bigint, onStage: (u: StageUpdate) => void): Promise<void> {
  const actionId = recordAction({ kind: 'withdraw', stage: 'signing', summary: `Withdraw ${formatAmount(amount, 6)} ${symbol} from the DEX to your wallet` })
  const stage = (u: Omit<StageUpdate, 'at'>) => {
    onStage({ ...u, at: Date.now() })
    if (u.stage === 'confirmed' || u.stage === 'failed' || u.stage === 'unknown' || u.stage === 'included') requestRefresh()
    patchAction(actionId, { stage: u.stage, txHash: u.txHash, block: u.block?.toString(), readback: u.stage === 'confirmed' ? u.detail : undefined, error: u.stage === 'failed' ? u.detail : undefined })
  }
  try {
    const signer = executor()
    stage({ stage: 'signing' })
    await assertChain(signer)
    const txHash = await Actions.dex.withdraw(signer.write, { token, amount })
    stage({ stage: 'submitted', txHash })
    const receipt = await readClient.waitForTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'success') throw new ExecutionError('Withdraw reverted', `Included in block ${receipt.blockNumber} but reverted.`)
    stage({ stage: 'included', txHash, block: receipt.blockNumber })
    stage({ stage: 'verifying', txHash, block: receipt.blockNumber })
    stage({ stage: 'confirmed', txHash, block: receipt.blockNumber, detail: 'Withdraw included. Balances refresh from chain.' })
  } catch (error) {
    const e = explainError(error)
    stage({ stage: 'failed', detail: `${e.title}. ${e.reason}` })
    throw new ExecutionError(e.title, e.reason)
  }
}

/** Signs a plain-text message with the active signer (EIP-191 personal_sign). */
export async function signText(message: string): Promise<{ signature: Hex; address: Address }> {
  const signer = executor()
  const signature = await signMessage(signer.write, { account: signer.write.account, message })
  return { signature, address: signer.address }
}

/** Testnet faucet: the RPC mints test USD tokens to the address. */
export async function fundFromFaucet(address: Address): Promise<Hex[]> {
  const actionId = recordAction({ kind: 'faucet', stage: 'submitted', summary: `Requested testnet faucet funds for ${address.slice(0, 6)}…${address.slice(-4)}` })
  try {
    const client = createClient({ chain: korrinChain, transport: http(undefined, { retryCount: 6, retryDelay: 350 }) }).extend(publicActions)
    // Funding is safe to repeat (it only mints more test tokens), so transient RPC failures retry.
    let hashes: readonly Hex[] = []
    for (let attempt = 1; ; attempt++) {
      try {
        hashes = await Actions.faucet.fund(client, { account: address })
        break
      } catch (error) {
        if (attempt >= 3 || !isTransient(error)) throw error
        await new Promise((r) => setTimeout(r, 1_500 * attempt))
      }
    }
    const results = await Promise.allSettled(hashes.map((hash) => client.waitForTransactionReceipt({ hash, timeout: 30_000 })))
    const included = results.filter((r) => r.status === 'fulfilled').length
    if (included === 0) throw new ExecutionError('Faucet transactions not included', `The faucet returned ${hashes.length} transactions but none were included within 30 seconds. Try again shortly.`)
    patchAction(actionId, { stage: 'confirmed', txHash: hashes[0], readback: included === hashes.length ? `${hashes.length} faucet transactions included` : `${included} of ${hashes.length} faucet transactions included within 30 s` })
    requestRefresh()
    return [...hashes]
  } catch (error) {
    const e = explainError(error)
    patchAction(actionId, { stage: 'failed', error: `${e.title}. ${e.reason}` })
    throw new ExecutionError(e.title, e.reason)
  }
}

'use client'

import { useSyncExternalStore } from 'react'
import { type Account, type Address, type Chain, type Client, createClient, http, publicActions, type Transport, walletActions, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { korrinChain } from '../tempo/chain'
import { getState, useSigner } from './store'

export type ExecutionSigner = {
  kind: 'wallet' | 'local'
  address: Address
  label: string
  write: Client<Transport, Chain, Account>
}

type External = { client: WalletClient; address: Address; connector: string } | null

let external: External = null
const listeners = new Set<() => void>()

/** Called by the wagmi bridge whenever the connected wallet changes. */
export function setExternalWallet(next: External): void {
  if (external?.address === next?.address && external?.client === next?.client) return
  external = next
  listeners.forEach((l) => l())
}

export const readClient = createClient({ chain: korrinChain, transport: http(undefined, { timeout: 20_000, retryCount: 6, retryDelay: 350 }) }).extend(publicActions)

export function getExecutionSigner(): ExecutionSigner | null {
  if (external?.client.account) {
    return { kind: 'wallet', address: external.address, label: external.connector, write: external.client as Client<Transport, Chain, Account> }
  }
  const local = getState().signer
  if (!local) return null
  const write = createClient({ account: privateKeyToAccount(local.privateKey), chain: korrinChain, transport: http(undefined, { timeout: 20_000, retryCount: 6, retryDelay: 350 }) }).extend(walletActions)
  return { kind: 'local', address: local.address, label: 'Korrin testnet signer', write: write as Client<Transport, Chain, Account> }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useExternalWallet(): External {
  return useSyncExternalStore(subscribe, () => external, () => null)
}

/** The signer the next transaction will use, for display. */
export function useActiveSigner(): { kind: 'wallet' | 'local'; address: Address; label: string } | null {
  const wallet = useExternalWallet()
  const local = useSigner()
  if (wallet) return { kind: 'wallet', address: wallet.address, label: wallet.connector }
  if (local) return { kind: 'local', address: local.address, label: 'Korrin testnet signer' }
  return null
}

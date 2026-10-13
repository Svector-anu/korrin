import type { Address, Hex } from 'viem'
import { tempoModerato } from 'viem/chains'

export const PATH_USD: Address = '0x20c0000000000000000000000000000000000000'
export const DEX_ADDRESS: Address = '0xdec0000000000000000000000000000000000000'
export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

/** Moderato with Multicall3 (observed deployed) and PathUSD as fee token. */
const withFeeToken = tempoModerato.extend({ feeToken: PATH_USD })
export const korrinChain = { ...withFeeToken, contracts: { ...withFeeToken.contracts, multicall3: { address: MULTICALL3 } } }

export const CHAIN_ID = korrinChain.id
export const RPC_URL = korrinChain.rpcUrls.default.http[0]
export const RPC_HOST = new URL(RPC_URL).host
export const EXPLORER_URL = korrinChain.blockExplorers?.default.url ?? 'https://explore.testnet.tempo.xyz'
export const NETWORK_LABEL = 'Tempo Moderato testnet'

export const explorerTx = (hash: Hex) => `${EXPLORER_URL}/tx/${hash}`
export const explorerAddress = (address: Address) => `${EXPLORER_URL}/address/${address}`
export const explorerBlock = (block: bigint | number | string) => `${EXPLORER_URL}/block/${block}`

export function shortHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 2) return value
  return `${value.slice(0, head + 2)}…${value.slice(-tail)}`
}

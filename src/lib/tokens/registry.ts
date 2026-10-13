import type { Address } from 'viem'
import list from './tokenlist.generated.json'

type Entry = { chainId: number; name: string; symbol: string; decimals: number; icon: string | null }
const tokens = list.tokens as Record<string, Entry>

const bySymbol = new Map<string, Entry>()
for (const entry of Object.values(tokens)) {
  const key = entry.symbol.toLowerCase()
  if (entry.icon && !bySymbol.has(key)) bySymbol.set(key, entry)
}

export type TokenDisplay = { symbol: string; name: string | null; icon: string | null; listed: boolean }

/** Official Tempo token-list entry for an address, with logo synced into /public/tokens. */
export function tokenDisplay(chainId: number, address: Address | string, fallbackSymbol?: string): TokenDisplay {
  const entry = tokens[`${chainId}:${address.toLowerCase()}`]
  if (entry) return { symbol: entry.symbol, name: entry.name, icon: entry.icon, listed: true }
  const symbol = fallbackSymbol ?? `${address.slice(0, 6)}…`
  return { symbol, name: null, icon: null, listed: false }
}

export const TOKENLIST_SOURCES = list.sources

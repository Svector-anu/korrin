'use client'

import { type Polled, ageLabel, useNow, usePolled } from '@/lib/client/data'
import { NETWORK_LABEL } from '@/lib/tempo/chain'
import { SignalDot } from '../ui/status'
import { Tooltip } from '../ui/tooltip'

type Head = { chainId: number; source: string; blockNumber: string; timestamp: string; observedAt: number }

export const useChainHead = () => usePolled<Head>('/api/head', 8_000)

function headState(head: Polled<Head>, now: number) {
  const age = head.receivedAt ? (now - head.receivedAt) / 1000 : null
  return head.error && (!age || age > 30) ? 'offline' : age === null ? 'idle' : age > 30 ? 'stale' : 'live'
}

/** Compact pill for the top bar on small screens, where the sidebar card is hidden. */
export function NetworkPill({ head }: { head: Polled<Head> }) {
  const now = useNow()
  return (
    <Tooltip content={head.data ? `Chain ${head.data.chainId}. Head block read ${ageLabel(head.receivedAt, now)}.` : head.error ? `Chain head unavailable: ${head.error}` : 'Reading chain head…'}>
      <span className="inline-flex h-9 items-center gap-2 rounded-full border hairline border-line px-3">
        <SignalDot state={headState(head, now)} label="Testnet" />
      </span>
    </Tooltip>
  )
}

/** Sidebar card: which network, how fresh the last read is, and what the funds are worth. */
export function NetworkCard({ head }: { head: Polled<Head> }) {
  const now = useNow()
  const state = headState(head, now)
  const block = head.data ? Number(head.data.blockNumber).toLocaleString('en-US') : null
  return (
    <div className="rounded-[var(--radius-card)] bg-canvas p-3.5 shadow-[var(--shadow-sheet)]">
      <SignalDot state={state} label={NETWORK_LABEL} className="text-[14px] font-medium text-ink" />
      <p className="mt-1.5 text-[13px] leading-snug text-muted">
        {block ? (
          <>
            Block <span className="tabular text-ink-2">#{block}</span>, read {ageLabel(head.receivedAt, now)}.
          </>
        ) : head.error ? (
          'The chain head is unreachable right now. Reads will retry.'
        ) : (
          'Reading the chain head…'
        )}
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-muted">Testnet funds only. Nothing here has real-world value.</p>
    </div>
  )
}

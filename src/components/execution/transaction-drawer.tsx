'use client'

import { ExternalLink } from 'lucide-react'
import { explorerBlock, explorerTx } from '@/lib/tempo/chain'
import { Drawer } from '../ui/overlay'
import { KeyValue } from '../ui/panel'
import { SourceBadge } from '../ui/status'
import type { TimelineItem } from './timeline'

const SOURCE_EXPLAIN = {
  onchain: 'Decoded from a Stablecoin DEX log returned by eth_getLogs. Anyone can verify it on the explorer.',
  wallet: 'A transaction this browser signed and submitted. Its stages were recorded as they happened.',
  replay: 'Part of a captured testnet session, replayed in order. The transactions are real and linked.',
  simulated: 'A planner input that did not come from chain. It never moves funds.',
  local: 'A decision or setting recorded in this browser. Nothing was sent to chain.',
} as const

export function TransactionDrawer({ item, onOpenChange }: { item: TimelineItem | null; onOpenChange: (open: boolean) => void; decimals?: number; symbol?: string }) {
  return (
    <Drawer open={item !== null} onOpenChange={onOpenChange} title={item?.title ?? ''} description={item ? <SourceBadge source={item.source} /> : undefined}>
      {item && (
        <div className="space-y-5">
          <p className="text-[14px] leading-snug text-ink-2">{SOURCE_EXPLAIN[item.source]}</p>
          {item.detail && <p className="text-[14px] leading-snug text-ink">{item.detail}</p>}
          <dl className="divide-y divide-line-faint">
            <KeyValue label="Time">{item.atMs ? new Date(item.atMs).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Unknown'}</KeyValue>
            {item.orderId && (
              <KeyValue label="Native order ID" mono>
                {item.orderId}
              </KeyValue>
            )}
            {item.block && (
              <KeyValue label="Block" mono>
                <a href={explorerBlock(item.block)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                  {Number(item.block).toLocaleString('en-US')} <ExternalLink className="size-3" />
                </a>
              </KeyValue>
            )}
            {item.txHash && (
              <KeyValue label="Transaction" mono>
                <a href={explorerTx(item.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                  {item.txHash.slice(0, 14)}…{item.txHash.slice(-8)} <ExternalLink className="size-3" />
                </a>
              </KeyValue>
            )}
            {item.status && <KeyValue label="Stage">{item.status.label}</KeyValue>}
          </dl>
          <div>
            <div className="label mb-1.5">Raw record</div>
            <pre className="tabular max-h-80 overflow-auto rounded-[var(--radius-panel)] bg-recessed p-3 text-[12.5px] leading-relaxed text-ink-2">{JSON.stringify(item.raw, null, 2)}</pre>
          </div>
        </div>
      )}
    </Drawer>
  )
}

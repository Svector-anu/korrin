'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/fields'
import { StatusPill, type Tone } from '@/components/ui/status'
import { cn } from '@/lib/cn'

const MARKETS = ['tempo-moderato:alphausd-pathusd', 'tempo-moderato:betausd-pathusd', 'tempo-moderato:thetausd-pathusd'] as const
type Market = (typeof MARKETS)[number]

type Preview = {
  reportId: string
  quality: 'HIGH' | 'DEGRADED' | 'UNAVAILABLE'
  qualityReasons: string[]
  window: { block: string | null; observedAt: string | null }
  quote: { bestBid: { value: string | null }; bestAsk: { value: string | null }; spreadBps: { value: string | null }; shape: string }
  coverage: { levelsInBand: number; unreadableLevelsInBand: number }
}

const TONE: Record<Preview['quality'], Tone> = { HIGH: 'positive', DEGRADED: 'hold', UNAVAILABLE: 'negative' }

/** Calls the free preview endpoint from the browser and shows the raw response next to a reading of it. */
export function LivePreview() {
  const [market, setMarket] = useState<Market>(MARKETS[1])
  const [state, setState] = useState<{ status: number; body: unknown; preview: Preview | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/v1/markets/${market}/health/preview`)
      const body = (await res.json()) as Preview & { error?: unknown }
      setState({ status: res.status, body, preview: res.ok ? body : null })
    } catch (error) {
      setState({ status: 0, body: { error: error instanceof Error ? error.message : String(error) }, preview: null })
    } finally {
      setBusy(false)
    }
  }
  const p = state?.preview
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <Segmented label="Market" value={market} onChange={setMarket} options={MARKETS.map((m) => ({ value: m, label: m.split(':')[1].split('-')[0].replace('usd', 'USD').replace(/^./, (c) => c.toUpperCase()) }))} />
        <Button variant="primary" loading={busy} onClick={run}>
          Call the preview
        </Button>
      </div>
      <p className="tabular px-5 pt-3 text-[13px] text-muted">GET /v1/markets/{market}/health/preview</p>
      {!state ? (
        <p className="px-5 pt-4 pb-6 text-[14px] text-muted">Free and read-only. It reads Tempo when you press the button.</p>
      ) : (
        <div className="mt-4 grid gap-px bg-line md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="bg-surface px-5 py-5">
            {p ? (
              <div className="space-y-3 text-[14px]">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={TONE[p.quality]}>{p.quality}</StatusPill>
                  <span className="tabular text-muted">block {p.window.block}</span>
                </div>
                <dl className="space-y-1.5">
                  {[
                    ['Best bid', p.quote.bestBid.value ?? 'none'],
                    ['Best ask', p.quote.bestAsk.value ?? 'none'],
                    ['Spread', p.quote.spreadBps.value ? `${p.quote.spreadBps.value} bp` : 'n/a'],
                    ['Book', p.quote.shape],
                    ['Levels read', `${p.coverage.levelsInBand - p.coverage.unreadableLevelsInBand} of ${p.coverage.levelsInBand}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-muted">{k}</dt>
                      <dd className="tabular text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                {p.qualityReasons.length > 0 && <p className="text-[13px] leading-snug text-ink-2">{p.qualityReasons.join(' ')}</p>}
                <p className="tabular text-[12px] text-muted">{p.reportId}</p>
              </div>
            ) : (
              <p className="text-[14px] text-negative">HTTP {state.status}. See the response.</p>
            )}
          </div>
          <pre className={cn('max-h-80 overflow-auto bg-recessed px-5 py-4 text-[12px] leading-relaxed text-ink-2')}>{JSON.stringify(state.body, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

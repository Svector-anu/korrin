import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { SESSION } from '@/lib/evidence/session'

export const alt = 'Korrin: put your stablecoin liquidity on the book. A liquidity corridor recorded on Tempo testnet, with order 18439345 resting as a bid.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const font = (file: string) => readFile(join(process.cwd(), 'src/assets/fonts', file))

const C = {
  canvas: '#0b0c0e',
  surface: '#131416',
  ink: '#f2f2f2',
  muted: '#8d8e91',
  faint: '#3a3b3e',
  line: 'rgba(255,255,255,0.08)',
  band: 'rgba(255,255,255,0.035)',
  bid: '#4fb08f',
  bidExternal: 'rgba(79,176,143,0.32)',
  ask: '#6b9cf0',
  askExternal: 'rgba(107,156,240,0.3)',
}

const CHART = { width: 360, height: 300 }

/** Bars for the captured book at the moment Korrin's first order was confirmed resting. */
function corridorBars() {
  const frame = SESSION.frames[1]
  const own = frame.orders[0]
  const { from, to } = SESSION.window
  const ticks: number[] = []
  for (let t = from; t <= to; t += 10) ticks.push(t)
  const units = (v: string | null) => (v ? Number(BigInt(v) / 1_000_000n) : 0)
  const max = Math.max(...frame.book.levels.map((l) => units(l.liquidity)))
  const slot = CHART.width / ticks.length
  return {
    own,
    slot,
    x: (tick: number) => ((tick - from) / 10) * slot,
    bars: ticks.map((tick) => {
      const level = frame.book.levels.find((l) => l.tick === tick)
      const isOwn = own?.status === 'live' && own.tick === tick
      const depth = units(level?.liquidity ?? null)
      const h = depth > 0 ? Math.max(isOwn ? 34 : 10, (Math.log10(depth + 1) / Math.log10(max + 1)) * (CHART.height - 40)) : 0
      return { tick, isBid: level?.isBid ?? tick < frame.book.bestAskTick, unreadable: level?.status === 'unreadable', isOwn, h }
    }),
  }
}

export default async function Image() {
  const [regular, medium, mono] = await Promise.all([font('manrope-latin-400-normal.woff'), font('manrope-latin-500-normal.woff'), font('jetbrains-mono-latin-400-normal.woff')])
  const m = SESSION.mandate
  const { bars, slot, x, own } = corridorBars()
  const ownBar = bars.find((b) => b.isOwn)
  const bandLeft = x(m.targetTick - m.bandTicks)
  const bandRight = x(m.targetTick + m.bandTicks) + slot
  const targetX = x(m.targetTick) + slot / 2
  const price = (tick: number) => (1 + tick / 100_000).toFixed(4)

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: C.canvas, color: C.ink, fontFamily: 'Manrope', padding: '64px 72px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="40" height="40" viewBox="0 0 24 24">
            <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6.5" fill={C.ink} />
            <line x1="7" y1="5.5" x2="7" y2="18.5" stroke={C.canvas} strokeOpacity="0.38" strokeWidth="1.2" />
            <line x1="17" y1="5.5" x2="17" y2="18.5" stroke={C.canvas} strokeOpacity="0.38" strokeWidth="1.2" />
            <rect x="9.4" y="10" width="2.2" height="8.5" rx="0.8" fill={C.canvas} />
            <rect x="12.4" y="7" width="2.2" height="11.5" rx="0.8" fill={C.canvas} fillOpacity="0.62" />
          </svg>
          <span style={{ fontSize: 32, fontWeight: 500, letterSpacing: -1 }}>Korrin</span>
        </div>
        <div style={{ display: 'flex', fontSize: 68, lineHeight: 1.02, letterSpacing: -2.8, marginTop: 64 }}>Put your stablecoin liquidity on the book.</div>
        <div style={{ display: 'flex', fontSize: 25, lineHeight: 1.4, color: C.muted, marginTop: 28, maxWidth: 520 }}>Set your prices and sizes. Approve each order. See what really reached Tempo’s order book.</div>
        <div style={{ display: 'flex', flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 999, background: 'rgba(79,176,143,0.14)', color: C.bid }}>
            <div style={{ display: 'flex', width: 9, height: 9, borderRadius: 999, background: C.bid }} />
            Live on Tempo testnet
          </div>
          <span style={{ fontFamily: 'JetBrains Mono', color: C.muted, fontSize: 18 }}>korrin-steel.vercel.app</span>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1 }} />

      <div style={{ display: 'flex', flexDirection: 'column', width: 420, padding: 30, borderRadius: 28, background: C.surface, border: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 17, color: C.muted }}>
          <span style={{ color: C.ink, fontWeight: 500, fontSize: 19 }}>AlphaUSD / PathUSD</span>
          <span>±{m.bandTicks / 10} bp</span>
        </div>
        <div style={{ display: 'flex', position: 'relative', width: CHART.width, height: CHART.height + 30, marginTop: 30 }}>
          <div style={{ display: 'flex', position: 'absolute', left: bandLeft, top: 26, width: bandRight - bandLeft, height: CHART.height - 26, background: C.band, borderLeft: `1px dashed ${C.faint}`, borderRight: `1px dashed ${C.faint}` }} />
          <div style={{ display: 'flex', position: 'absolute', left: targetX, top: 26, width: 1.5, height: CHART.height - 26, background: C.ink }} />
          <div style={{ display: 'flex', position: 'absolute', left: targetX - 70, width: 140, top: 0, justifyContent: 'center', fontSize: 15, color: C.ink }}>Target {price(m.targetTick)}</div>
          {bars.map((b) =>
            b.unreadable ? (
              <div key={b.tick} style={{ display: 'flex', position: 'absolute', left: x(b.tick) + 2, top: CHART.height - 22, width: slot - 4, height: 22, border: `1px dashed ${C.faint}`, borderRadius: 2 }} />
            ) : b.h > 0 ? (
              <div
                key={b.tick}
                style={{ display: 'flex', position: 'absolute', left: x(b.tick) + 2, top: CHART.height - b.h, width: slot - 4, height: b.h, borderRadius: 2, background: b.isOwn ? C.bid : b.isBid ? C.bidExternal : C.askExternal }}
              />
            ) : null,
          )}
          {own?.tick !== undefined && (
            <div style={{ display: 'flex', position: 'absolute', left: x(own.tick) + slot / 2 - 60, width: 120, top: CHART.height - (ownBar?.h ?? 0) - 24, justifyContent: 'center', fontFamily: 'JetBrains Mono', fontSize: 13, color: C.ink }}>#{own.orderId}</div>
          )}
          <div style={{ display: 'flex', position: 'absolute', left: 0, top: CHART.height, width: CHART.width, height: 1, background: C.line }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, fontSize: 16, color: C.muted }}>
          <span style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: C.bid }}>Bid {price(own?.tick ?? 0)}</span> resting, flips to {price(own?.flipTick ?? 0)}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13 }}>Recorded on Tempo testnet, block {Number(SESSION.frames[1].book.blockNumber).toLocaleString('en-US')}</span>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Manrope', data: regular, weight: 400, style: 'normal' },
        { name: 'Manrope', data: medium, weight: 500, style: 'normal' },
        { name: 'JetBrains Mono', data: mono, weight: 400, style: 'normal' },
      ],
    },
  )
}

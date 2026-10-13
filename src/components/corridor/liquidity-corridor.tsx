'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatTickPrice, ticksToBps } from '@/lib/market/ticks'
import { formatAmount, formatCompact } from '@/lib/units'
import type { CorridorLevel, CorridorModel } from './model'

const EASE = [0.22, 0.61, 0.36, 1] as const

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

type Hover = { tick: number; x: number }

export function LiquidityCorridor({
  model,
  paused = false,
  height = 360,
  className,
  caption,
}: {
  model: CorridorModel
  paused?: boolean
  height?: number
  className?: string
  caption?: string
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const reduce = useReducedMotion()
  const uid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<Hover | null>(null)

  const W = Math.max(width, 320)
  const compact = W < 640
  const pad = { l: compact ? 12 : 28, r: compact ? 12 : 28 }
  const top = 44
  const baseline = height - (model.coverage ? 132 : 72)
  const plotH = baseline - top
  const span = Math.max(model.to - model.from, 10)
  const x = (tick: number) => pad.l + ((tick - model.from) / span) * (W - pad.l - pad.r)
  const slot = (10 / span) * (W - pad.l - pad.r)
  const barW = Math.max(2, Math.min(slot * 0.58, 22))
  const unit = 10n ** BigInt(model.decimals)

  const maxTotal = useMemo(() => {
    let m = 1
    for (const l of model.levels) {
      const v = Number((l.total ?? l.own) / unit)
      if (v > m) m = v
    }
    for (const o of model.orders) m = Math.max(m, Number(o.remaining / unit))
    return m
  }, [model.levels, model.orders, unit])

  const h = (amount: bigint) => {
    const v = Number(amount) / Number(unit)
    if (v <= 0) return 0
    return Math.max(2, (Math.log10(1 + v) / Math.log10(1 + maxTotal)) * (plotH - 18))
  }

  const band = { lo: model.targetTick - model.bandTicks, hi: model.targetTick + model.bandTicks }
  const labelEvery = Math.max(1, Math.ceil((compact ? 70 : 84) / slot))
  const axisTicks: number[] = []
  for (let t = Math.ceil(model.from / 10) * 10; t <= model.to; t += 10) axisTicks.push(t)

  const hoveredLevels = hover ? model.levels.filter((l) => l.tick === hover.tick) : []
  const hoveredOrders = hover ? model.orders.filter((o) => o.tick === hover.tick) : []

  const sideColor = (isBid: boolean) => (isBid ? 'var(--bid)' : 'var(--ask)')

  return (
    <figure className={cn('relative select-none', className)} aria-label={caption ?? 'Liquidity corridor'}>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-hidden className="absolute inset-0 overflow-visible">
            <defs>
              <pattern id={`hb-${uid}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="var(--bid-soft)" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--bid-external)" strokeWidth="2" />
              </pattern>
              <pattern id={`ha-${uid}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="var(--ask-soft)" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ask-external)" strokeWidth="2" />
              </pattern>
              <marker id={`arrow-${uid}`} viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M1 1 L7 4 L1 7" fill="none" stroke="var(--ink-2)" strokeWidth="1.2" />
              </marker>
            </defs>

            {/* corridor band */}
            {model.bandTicks > 0 && <rect x={x(band.lo)} y={top - 14} width={Math.max(0, x(band.hi) - x(band.lo))} height={baseline - top + 14} fill="var(--band)" rx={3} />}
            {model.bandTicks > 0 && [band.lo, band.hi].map((t, i) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={top - 14} y2={baseline} stroke="var(--band-edge)" strokeWidth={1} strokeDasharray="2 3" />
                <text x={x(t) + (i === 0 ? 4 : -4)} y={top - 20} textAnchor={i === 0 ? 'start' : 'end'} className="fill-[var(--ink-muted)] text-[11.5px]">
                  {i === 0 ? '−' : '+'}
                  {ticksToBps(model.bandTicks)} bp
                </text>
              </g>
            ))}

            {/* horizontal grid */}
            {[0.33, 0.66].map((f) => (
              <line key={f} x1={pad.l} x2={W - pad.r} y1={baseline - f * plotH} y2={baseline - f * plotH} stroke="var(--grid)" strokeWidth={1} />
            ))}

            {/* market levels */}
            {model.levels.map((l) => (
              <LevelBar key={`${l.tick}:${l.isBid}`} level={l} x={x(l.tick)} barW={barW} baseline={baseline} plotH={plotH} h={h} uid={uid} paused={paused} reduce={!!reduce} showLabel={slot >= 36} decimals={model.decimals} />
            ))}

            {/* proposed order (awaiting approval) */}
            {model.proposal && (
              <g style={{ opacity: paused ? 0.35 : 1 }}>
                <rect
                  x={x(model.proposal.tick) - barW / 2 - 2}
                  y={baseline - h(model.proposal.amount) - 2}
                  width={barW + 4}
                  height={h(model.proposal.amount) + 2}
                  fill="none"
                  stroke={sideColor(model.proposal.side === 'buy')}
                  strokeWidth={1.25}
                  strokeDasharray="3 2.5"
                  rx={2}
                />
                <text x={x(model.proposal.tick)} y={baseline - h(model.proposal.amount) - 9} textAnchor="middle" className="fill-[var(--ink-2)] text-[11.5px]">
                  Proposed
                </text>
              </g>
            )}

            {/* target */}
            <line x1={x(model.targetTick)} x2={x(model.targetTick)} y1={top - 14} y2={baseline + 6} stroke="var(--target)" strokeWidth={1.25} />
            <text x={x(model.targetTick)} y={top - 20} textAnchor="middle" className="fill-[var(--ink-structural)] text-[12px] font-medium">
              {model.targetLabel ?? 'Target'} {formatTickPrice(model.targetTick)}
            </text>

            {/* own orders and flip traces, keyed by native order ID so a flip moves the same mark */}
            {model.orders.map((o) => {
              const ox = x(o.tick)
              const fx = x(o.flipTick)
              const hh = h(o.remaining)
              const color = sideColor(o.isBid)
              const resting = o.state === 'resting'
              const mid = (ox + fx) / 2
              const lane = baseline + 30
              return (
                <motion.g
                  key={o.orderId}
                  initial={false}
                  animate={{ opacity: paused ? 0.4 : 1 }}
                  transition={{ duration: reduce ? 0 : 0.28, ease: EASE }}
                  style={{ filter: paused ? 'grayscale(1)' : undefined }}
                >
                  <motion.path
                    initial={false}
                    animate={{ d: `M ${ox} ${baseline + 4} Q ${mid} ${lane} ${fx} ${baseline + 4}` }}
                    transition={{ duration: reduce ? 0 : 0.36, ease: EASE }}
                    fill="none"
                    stroke="var(--ink-2)"
                    strokeOpacity={0.55}
                    strokeWidth={1}
                    strokeDasharray={resting ? undefined : '2 3'}
                    markerEnd={`url(#arrow-${uid})`}
                  />
                  <motion.rect
                    initial={false}
                    animate={{ x: ox - barW / 2, y: baseline - hh, height: hh }}
                    fill={resting ? color : 'none'}
                    transition={{ duration: reduce ? 0 : 0.36, ease: EASE }}
                    width={barW}
                    rx={1.5}
                    stroke={resting ? 'none' : color}
                    strokeWidth={1.25}
                    strokeDasharray={resting ? undefined : '3 2'}
                  />
                  <motion.circle initial={false} animate={{ cx: ox, cy: baseline - hh - 6 }} transition={{ duration: reduce ? 0 : 0.36, ease: EASE }} r={2.5} fill={resting ? color : 'var(--surface)'} stroke={color} strokeWidth={1} />
                  {!compact && (
                    <motion.text initial={false} animate={{ x: ox, y: baseline - hh - 14 }} transition={{ duration: reduce ? 0 : 0.36, ease: EASE }} textAnchor="middle" className="tabular fill-[var(--ink)] text-[11.5px]">
                      {o.state === 'pending' ? 'Pending' : o.state === 'unknown' ? 'Unverified' : `#${o.orderId}`}
                    </motion.text>
                  )}
                </motion.g>
              )
            })}

            {/* axis */}
            <line x1={pad.l} x2={W - pad.r} y1={baseline} y2={baseline} stroke="var(--line-strong)" strokeWidth={1} />
            {axisTicks.map((t, i) => {
              const major = (t - model.targetTick) % (10 * labelEvery) === 0
              return (
                <g key={t}>
                  <line x1={x(t)} x2={x(t)} y1={baseline} y2={baseline + (major ? 6 : 3)} stroke="var(--line-strong)" strokeWidth={1} />
                  {major && i >= 0 && (
                    <text x={x(t)} y={baseline + 54} textAnchor="middle" className="tabular fill-[var(--ink-muted)] text-[11.5px]">
                      {formatTickPrice(t)}
                    </text>
                  )}
                </g>
              )
            })}
            {model.bestBidTick !== null && model.bestBidTick >= model.from && model.bestBidTick <= model.to && (
              <BestMarker x={x(model.bestBidTick)} y={baseline} label="Best bid" color="var(--bid)" anchor="end" />
            )}
            {model.bestAskTick !== null && model.bestAskTick >= model.from && model.bestAskTick <= model.to && (
              <BestMarker x={x(model.bestAskTick)} y={baseline} label="Best ask" color="var(--ask)" anchor="start" />
            )}

            {/* coverage */}
            {model.coverage && (
              <g transform={`translate(0 ${baseline + 72})`}>
                <CoverageStrip x={pad.l} w={(W - pad.l - pad.r) / 2 - 12} label={compact ? 'Bid' : 'Bid coverage'} compact={compact} own={model.coverage.bid.own} target={model.coverage.bid.target} decimals={model.decimals} symbol={model.baseSymbol} color="var(--bid)" paused={paused} reduce={!!reduce} />
                <CoverageStrip x={W / 2 + 12} w={(W - pad.l - pad.r) / 2 - 12} label={compact ? 'Ask' : 'Ask coverage'} compact={compact} own={model.coverage.ask.own} target={model.coverage.ask.target} decimals={model.decimals} symbol={model.baseSymbol} color="var(--ask)" paused={paused} reduce={!!reduce} />
              </g>
            )}

            {/* hover crosshair */}
            {hover && <line x1={hover.x} x2={hover.x} y1={top - 14} y2={baseline} stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="1 2" />}

            {/* hit targets */}
            {axisTicks.map((t) => (
              <rect key={t} x={x(t) - slot / 2} y={top - 14} width={slot} height={baseline - top + 30} fill="transparent" onPointerEnter={() => setHover({ tick: t, x: x(t) })} onPointerLeave={() => setHover((cur) => (cur?.tick === t ? null : cur))} />
            ))}
          </svg>
        )}

        {hover && (hoveredLevels.length > 0 || hoveredOrders.length > 0 || true) && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-[var(--radius-panel)] bg-raised px-3 py-2.5 text-[13px] shadow-[var(--shadow-float)]"
            style={{ left: Math.min(Math.max(hover.x - 112, 4), W - 228), top: 6 }}
          >
            <div className="flex items-baseline justify-between">
              <span className="tabular text-[14px] text-ink">{formatTickPrice(hover.tick, 5)}</span>
              <span className="tabular text-muted">
                tick {hover.tick} · {ticksToBps(hover.tick - model.targetTick) >= 0 ? '+' : ''}
                {ticksToBps(hover.tick - model.targetTick)} bp
              </span>
            </div>
            <div className="mt-1.5 space-y-1">
              {hoveredLevels.length === 0 && hoveredOrders.length === 0 && <div className="text-muted">No resting liquidity observed at this level.</div>}
              {hoveredLevels.map((l) => (
                <div key={String(l.isBid)} className="flex justify-between gap-3">
                  <span className="text-muted">{l.isBid ? 'Bids' : 'Asks'} at level</span>
                  <span className="tabular text-ink">
                    {l.status === 'ok' && l.total !== null ? `${formatAmount(l.total, model.decimals)}` : l.status === 'unreadable' ? 'unreadable' : 'not read'}
                  </span>
                </div>
              ))}
              {hoveredLevels.some((l) => l.own > 0n) &&
                hoveredLevels
                  .filter((l) => l.own > 0n)
                  .map((l) => (
                    <div key={`own-${l.isBid}`} className="flex justify-between gap-3">
                      <span className="text-muted">Korrin-owned</span>
                      <span className="tabular text-ink">{formatAmount(l.own, model.decimals)}</span>
                    </div>
                  ))}
              {hoveredOrders.map((o) => (
                <div key={o.orderId} className="hairline-t mt-1 flex justify-between gap-3 border-line pt-1">
                  <span className="text-muted">Order #{o.orderId}</span>
                  <span className="text-ink">
                    {o.state === 'resting' ? `flips to ${formatTickPrice(o.flipTick)}` : o.state === 'pending' ? 'checking the book' : 'not confirmed'}
                  </span>
                </div>
              ))}
            </div>
            <div className="label mt-1.5">{model.baseSymbol} per level</div>
          </div>
        )}
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[12.5px] text-muted">
        {model.orders.length > 0 && <Legend swatch={<span className="inline-block h-2.5 w-2 rounded-[1px] bg-bid" />} label="Your bid" />}
        {model.orders.length > 0 && <Legend swatch={<span className="inline-block h-2.5 w-2 rounded-[1px] bg-ask" />} label="Your ask" />}
        <Legend swatch={<span className="hatch-bid inline-block h-2.5 w-2 rounded-[1px] bg-bid-soft" />} label="Other bids" />
        <Legend swatch={<span className="hatch-ask inline-block h-2.5 w-2 rounded-[1px] bg-ask-soft" />} label="Other asks" />
        <Legend swatch={<span className="inline-block h-2.5 w-2 rounded-[1px] border border-dashed border-faint" />} label="Level unreadable" />
        {model.bandTicks > 0 && <Legend swatch={<span className="inline-block h-2.5 w-4 rounded-[1px] bg-[var(--band)] ring-1 ring-[var(--band-edge)] ring-inset" />} label="Your range" />}
        <span className="ml-auto">Depth per level, log scale</span>
      </figcaption>
    </figure>
  )
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  )
}

function LevelBar({
  level,
  x,
  barW,
  baseline,
  plotH,
  h,
  uid,
  paused,
  reduce,
  showLabel,
  decimals,
}: {
  level: CorridorLevel
  showLabel: boolean
  decimals: number
  x: number
  barW: number
  baseline: number
  plotH: number
  h: (v: bigint) => number
  uid: string
  paused: boolean
  reduce: boolean
}) {
  const offset = level.isBid ? -barW * 0.12 : barW * 0.12
  if (level.status !== 'ok' || level.total === null) {
    if (level.status === 'not_read') return null
    const hh = plotH * 0.22
    return (
      <g>
        <rect x={x - barW / 2 + offset} y={baseline - hh} width={barW} height={hh} fill="none" stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="2 2" rx={1.5} />
        <text x={x + offset} y={baseline - hh - 4} textAnchor="middle" className="fill-[var(--ink-faint)] text-[11px]">
          ?
        </text>
      </g>
    )
  }
  const hh = h(level.total)
  return (
    <g>
      {showLabel && (
        <motion.text initial={false} animate={{ y: baseline - hh - 5 }} transition={{ duration: reduce ? 0 : 0.32, ease: EASE }} x={x + offset} textAnchor="middle" className="tabular fill-[var(--ink-muted)] text-[9.5px]">
          {formatCompact(level.total, decimals)}
        </motion.text>
      )}
    <motion.rect
      initial={false}
      animate={{ y: baseline - hh, height: hh }}
      transition={{ duration: reduce ? 0 : 0.32, ease: EASE }}
      x={x - barW / 2 + offset}
      width={barW}
      rx={1.5}
      fill={`url(#${level.isBid ? 'hb' : 'ha'}-${uid})`}
      stroke={level.isBid ? 'var(--bid-external)' : 'var(--ask-external)'}
      strokeWidth={0.75}
      style={{ opacity: paused ? 0.85 : 1 }}
    />
    </g>
  )
}

function BestMarker({ x, y, label, color, anchor }: { x: number; y: number; label: string; color: string; anchor: 'start' | 'end' }) {
  return (
    <g>
      <path d={`M ${x - 4} ${y + 12} L ${x} ${y + 7} L ${x + 4} ${y + 12} Z`} fill={color} />
      <text x={anchor === 'end' ? x - 6 : x + 6} y={y + 22} textAnchor={anchor} className="fill-[var(--ink-muted)] text-[11px]">
        {label}
      </text>
    </g>
  )
}

function CoverageStrip({
  x,
  w,
  label,
  own,
  target,
  decimals,
  symbol,
  color,
  paused,
  reduce,
  compact,
}: {
  x: number
  w: number
  compact: boolean
  label: string
  own: bigint
  target: bigint
  decimals: number
  symbol: string
  color: string
  paused: boolean
  reduce: boolean
}) {
  const ratio = target === 0n ? 1 : Math.min(1, Number((own * 10_000n) / target) / 10_000)
  return (
    <g transform={`translate(${x} 0)`}>
      <text x={0} y={0} className="fill-[var(--ink-muted)] text-[12px]">
        {label}
      </text>
      <text x={w} y={0} textAnchor="end" className="tabular fill-[var(--ink)] text-[12px]">
        {compact ? `${(ratio * 100).toFixed(0)}%` : `${formatCompact(own, decimals)} / ${formatCompact(target, decimals)} ${symbol} · ${(ratio * 100).toFixed(0)}%`}
      </text>
      {compact && (
        <text x={0} y={28} className="tabular fill-[var(--ink-muted)] text-[11.5px]">
          {formatCompact(own, decimals)} / {formatCompact(target, decimals)}
        </text>
      )}
      <rect x={0} y={9} width={w} height={4} rx={2} fill="var(--line)" />
      <motion.rect initial={false} animate={{ width: w * ratio }} transition={{ duration: reduce ? 0 : 0.36, ease: EASE }} x={0} y={9} height={4} rx={2} fill={color} style={{ opacity: paused ? 0.4 : 1 }} />
    </g>
  )
}

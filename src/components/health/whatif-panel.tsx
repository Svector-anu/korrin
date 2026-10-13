'use client'

import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { ProposalKindBadge } from '@/components/mandate/decision'
import { Button } from '@/components/ui/button'
import { AmountInput, RangeField } from '@/components/ui/fields'
import { Modal } from '@/components/ui/overlay'
import { StatusPill } from '@/components/ui/status'
import { patchMandate, recordAction } from '@/lib/client/store'
import { type PolicyOverrides, type SimulationResult, simulatePolicyChange } from '@/lib/health/simulate'
import { pickPolicy, policyDigest } from '@/lib/mandate/digest'
import type { LiquidityMandate } from '@/lib/mandate/types'
import type { PlanningSnapshot } from '@/lib/policy/plan'
import { formatAmount, fromUnits, tryToUnits } from '@/lib/units'

type Draft = { targetBid: string; targetAsk: string; bandBps: number; offsetBps: number; reserveQuote: string; reserveBase: string }

const LABEL: Record<keyof PolicyOverrides, string> = {
  targetBidDepth: 'Bid target',
  targetAskDepth: 'Ask target',
  bandTicks: 'Range',
  quoteOffsetTicks: 'Quote distance',
  reserveBase: 'Kept in wallet (base)',
  reserveQuote: 'Kept in wallet (quote)',
  maxOrderAmount: 'Largest order',
  maxBaseAllocation: 'Funds for asks',
  maxQuoteAllocation: 'Funds for bids',
}

function toDraft(m: LiquidityMandate): Draft {
  const d = m.base.decimals
  return { targetBid: fromUnits(BigInt(m.targetBidDepth), d), targetAsk: fromUnits(BigInt(m.targetAskDepth), d), bandBps: m.bandTicks / 10, offsetBps: m.quoteOffsetTicks / 10, reserveQuote: fromUnits(BigInt(m.reserveQuote), d), reserveBase: fromUnits(BigInt(m.reserveBase), d) }
}

function overridesFrom(m: LiquidityMandate, d: Draft): PolicyOverrides | null {
  const dec = m.base.decimals
  const amounts = [d.targetBid, d.targetAsk, d.reserveQuote, d.reserveBase].map((v) => tryToUnits(v, dec))
  if (amounts.some((v) => v === null || v < 0n)) return null
  const [targetBid, targetAsk, reserveQuote, reserveBase] = amounts as bigint[]
  return { targetBidDepth: targetBid.toString(), targetAskDepth: targetAsk.toString(), bandTicks: d.bandBps * 10, quoteOffsetTicks: d.offsetBps * 10, reserveQuote: reserveQuote.toString(), reserveBase: reserveBase.toString() }
}

/**
 * What-if analysis on a frozen observation. Runs the same planner as the live
 * screen against a copy of the plan; the saved plan only changes through the
 * separate "Save as new version" review.
 */
export function WhatIfPanel({ mandate, snapshot, seed }: { mandate: LiquidityMandate; snapshot: PlanningSnapshot | null; seed?: PolicyOverrides }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft({ ...mandate, ...seed }))
  const [result, setResult] = useState<{ sim: SimulationResult; overrides: PolicyOverrides } | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const d = mandate.base.decimals
  const overrides = overridesFrom(mandate, draft)

  const run = () => {
    if (!snapshot || !overrides) return
    setResult({ sim: simulatePolicyChange(mandate, snapshot, overrides), overrides })
  }

  const save = () => {
    if (!result?.sim.ok) return
    const next: LiquidityMandate = { ...mandate, ...result.overrides, version: mandate.version + 1, updatedAt: new Date().toISOString() }
    const digest = policyDigest(pickPolicy(next))
    patchMandate(mandate.id, { ...result.overrides, version: next.version, updatedAt: next.updatedAt, policyDigest: digest })
    recordAction({ mandateId: mandate.id, kind: 'policy', stage: 'recorded', summary: `Saved a what-if as plan v${next.version} (${result.sim.changedFields.map((f) => LABEL[f]).join(', ')}; plan ID ${digest.slice(0, 10)}…)` })
    setReviewing(false)
    setResult(null)
  }

  const fmt = (v: string) => `${formatAmount(BigInt(v), d)}`
  const sim = result?.sim

  return (
    <section id="whatif" className="card min-w-0 scroll-mt-24" aria-labelledby="whatif-title">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 id="whatif-title" className="title flex items-center gap-2">
            <FlaskConical className="size-4.5 text-muted" strokeWidth={1.6} /> What if
          </h2>
          <p className="label mt-0.5">Try different targets and limits against the current read. Nothing is saved or signed.</p>
        </div>
        <StatusPill tone="unknown" icon={<FlaskConical className="size-3" />}>
          Simulation
        </StatusPill>
      </header>
      <div className="grid gap-6 px-5 pt-5 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <AmountInput label="Bid target" value={draft.targetBid} onChange={(v) => setDraft({ ...draft, targetBid: v })} unit={mandate.base.symbol} />
            <AmountInput label="Ask target" value={draft.targetAsk} onChange={(v) => setDraft({ ...draft, targetAsk: v })} unit={mandate.base.symbol} />
          </div>
          <RangeField label="How far either side" min={1} max={50} step={1} value={draft.bandBps} onChange={(v) => setDraft({ ...draft, bandBps: v, offsetBps: Math.min(draft.offsetBps, v) })} format={(v) => `±${v} bp`} />
          <RangeField label="Quote distance from target" min={1} max={Math.max(1, draft.bandBps)} step={1} value={draft.offsetBps} onChange={(v) => setDraft({ ...draft, offsetBps: v })} format={(v) => `${v} bp`} />
          <div className="grid grid-cols-2 gap-3">
            <AmountInput label={`Keep in wallet (${mandate.quote.symbol})`} value={draft.reserveQuote} onChange={(v) => setDraft({ ...draft, reserveQuote: v })} unit={mandate.quote.symbol} />
            <AmountInput label={`Keep in wallet (${mandate.base.symbol})`} value={draft.reserveBase} onChange={(v) => setDraft({ ...draft, reserveBase: v })} unit={mandate.base.symbol} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={run} disabled={!snapshot || !overrides}>
              Run what-if
            </Button>
            <Button variant="ghost" onClick={() => setDraft(toDraft(mandate))}>
              Reset to current plan
            </Button>
          </div>
          {!snapshot && <p className="text-[13.5px] text-muted">Waiting for a read of the book to simulate against.</p>}
          {!overrides && <p className="text-[13.5px] text-negative">Enter amounts as numbers, such as 500 or 250.5.</p>}
        </div>

        <div className="min-w-0">
          {!sim ? (
            <div className="flex h-full min-h-40 items-center justify-center rounded-[var(--radius-panel)] border border-dashed border-line-strong px-6 text-center text-[14px] text-muted">Change a value and run it to compare the next step, the gaps and the funds needed.</div>
          ) : !sim.ok ? (
            <ul className="space-y-1.5 rounded-[var(--radius-panel)] bg-negative-soft px-4 py-3 text-[14px] text-negative">
              {sim.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : (
            <div className="rounded-[var(--radius-panel)] bg-recessed">
              <table className="w-full text-[14px]">
                <caption className="sr-only">Current plan compared with the what-if, on the same read</caption>
                <thead>
                  <tr className="text-[13px] text-muted">
                    <th scope="col" className="px-4 pt-3 pb-2 text-left font-normal">
                      At block {Number(sim.observationBlock).toLocaleString('en-US')}
                    </th>
                    <th scope="col" className="px-4 pt-3 pb-2 text-right font-normal">
                      Current plan
                    </th>
                    <th scope="col" className="px-4 pt-3 pb-2 text-right font-normal">
                      What-if
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {[
                    ['Bid gap', fmt(sim.before.shortfallBid), fmt(sim.after.shortfallBid)],
                    ['Ask gap', fmt(sim.before.shortfallAsk), fmt(sim.after.shortfallAsk)],
                    [`${mandate.quote.symbol} to close the bid gap`, fmt(sim.before.funding.quoteNeeded), fmt(sim.after.funding.quoteNeeded)],
                    [`${mandate.quote.symbol} free to use`, sim.before.funding.quoteAvailable === null ? 'Unknown' : fmt(sim.before.funding.quoteAvailable), sim.after.funding.quoteAvailable === null ? 'Unknown' : fmt(sim.after.funding.quoteAvailable)],
                    [`${mandate.base.symbol} to close the ask gap`, fmt(sim.before.funding.baseNeeded), fmt(sim.after.funding.baseNeeded)],
                    [`${mandate.base.symbol} free to use`, sim.before.funding.baseAvailable === null ? 'Unknown' : fmt(sim.before.funding.baseAvailable), sim.after.funding.baseAvailable === null ? 'Unknown' : fmt(sim.after.funding.baseAvailable)],
                  ].map(([k, a, b]) => (
                    <tr key={k} className="hairline-t border-line">
                      <th scope="row" className="px-4 py-2.5 text-left font-sans font-normal text-ink-2">
                        {k}
                      </th>
                      <td className="px-4 py-2.5 text-right text-ink-2">{a}</td>
                      <td className={`px-4 py-2.5 text-right ${a !== b ? 'text-ink' : 'text-muted'}`}>{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="hairline-t space-y-2 border-line px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  Next step with the what-if <ProposalKindBadge kind={sim.after.kind} />
                </div>
                <p className="text-[14px] leading-snug text-ink">{sim.after.action}</p>
                {sim.after.kind === 'NO_ACTION' && <p className="text-[13.5px] leading-snug text-ink-2">{sim.after.cause}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[12.5px] text-muted">
                    {sim.engineVersion}. {mandate.status === 'paused' ? 'Evaluated as if the market were active.' : 'Same planner as the live screen.'}
                  </span>
                  <Button size="sm" variant="secondary" disabled={sim.changedFields.length === 0} onClick={() => setReviewing(true)}>
                    Review as a new plan version
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {reviewing && sim?.ok && result && (
        <Modal
          open
          onOpenChange={(o) => !o && setReviewing(false)}
          title={`Save as plan v${mandate.version + 1}?`}
          description="Applies to new orders only. Orders already on the book stay as they are. Nothing is signed."
          footer={
            <>
              <Button variant="ghost" onClick={() => setReviewing(false)}>
                Keep v{mandate.version}
              </Button>
              <Button variant="primary" onClick={save}>
                Save v{mandate.version + 1}
              </Button>
            </>
          }
        >
          <dl className="divide-y divide-line-faint rounded-[var(--radius-panel)] bg-recessed px-4">
            {sim.changedFields.map((f) => {
              const show = (v: LiquidityMandate[keyof PolicyOverrides]) => (f === 'bandTicks' || f === 'quoteOffsetTicks' ? `${Number(v) / 10} bp` : `${formatAmount(BigInt(String(v)), d)}`)
              return (
                <div key={f} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
                  <dt className="text-muted">{LABEL[f]}</dt>
                  <dd className="tabular text-ink">
                    <span className="text-muted line-through">{show(mandate[f])}</span> → {show(result.overrides[f] ?? mandate[f])}
                  </dd>
                </div>
              )
            })}
          </dl>
        </Modal>
      )}
    </section>
  )
}

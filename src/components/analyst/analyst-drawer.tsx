'use client'

import { ArrowUp, CircleAlert, ShieldCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/overlay'
import { LoadingState } from '@/components/ui/states'
import { CURATED_PROMPTS, type AnalystAnswer, type AnalystIntent } from '@/lib/analyst/types'
import { toWirePlanning } from '@/lib/analyst/wire'
import type { MarketException } from '@/lib/health/exceptions'
import type { Incident } from '@/lib/health/incidents'
import type { PolicyOverrides } from '@/lib/health/simulate'
import type { LiquidityHealthReport } from '@/lib/health/types'
import type { LiquidityMandate } from '@/lib/mandate/types'
import type { PlanningSnapshot } from '@/lib/policy/plan'
import { cn } from '@/lib/cn'

type Result = { answer: AnalystAnswer; verified: AnalystAnswer; asked: string } | { error: string; asked: string }

function Evidence({ paths }: { paths: string[] }) {
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {paths.slice(0, 4).map((p) => (
        <span key={p} className="tabular rounded-full border hairline border-line px-1.5 py-0.5 text-[11px] text-muted">
          {p}
        </span>
      ))}
    </span>
  )
}

/**
 * Read-only analyst. Sends the frozen report and its derived context; the answer
 * comes back with the deterministic findings it was checked against, shown as
 * "Data verified" separately from any model wording.
 */
export function AnalystDrawer({
  open,
  onOpenChange,
  report,
  previous,
  exceptions,
  incidents,
  mandate,
  planning,
  onOpenReview,
  onApplyDraft,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  report: LiquidityHealthReport | null
  previous: LiquidityHealthReport | null
  exceptions: MarketException[]
  incidents: Incident[]
  mandate: LiquidityMandate
  planning: PlanningSnapshot | null
  onOpenReview: () => void
  onApplyDraft: (draft: PolicyOverrides) => void
}) {
  const [frozen, setFrozen] = useState<{ report: LiquidityHealthReport; previous: LiquidityHealthReport | null } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const context = frozen ?? (report ? { report, previous } : null)

  const ask = async (intent: AnalystIntent | undefined, text: string | undefined, label: string) => {
    if (!context) return
    setFrozen(context)
    setBusy(true)
    try {
      const res = await fetch('/v1/analyst/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intent,
          question: text,
          context: { report: context.report, previous: context.previous, exceptions, incidents, policy: mandate, planning: planning ? toWirePlanning(planning) : null },
        }),
      })
      const body = (await res.json()) as { answer?: AnalystAnswer; verified?: AnalystAnswer; error?: { message: string } }
      setResult(body.answer && body.verified ? { answer: body.answer, verified: body.verified, asked: label } : { error: body.error?.message ?? `The analyst returned HTTP ${res.status}.`, asked: label })
    } catch (error) {
      setResult({ error: `The analyst could not be reached: ${error instanceof Error ? error.message : String(error)}`, asked: label })
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = question.trim()
    if (!q) return
    void ask(undefined, q, q)
    setQuestion('')
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setFrozen(null)
          setResult(null)
        }
        onOpenChange(o)
      }}
      title="Korrin Analyst"
      description={context ? `Explains report ${context.report.reportId} at block ${Number(context.report.window.block ?? 0).toLocaleString('en-US')}. It can’t sign, trade or change your plan.` : 'Waiting for the first report.'}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {CURATED_PROMPTS.map((p) => (
            <button
              key={p.intent}
              type="button"
              disabled={!context || busy}
              onClick={() => void ask(p.intent, undefined, p.label)}
              className="rounded-full border hairline border-line-strong px-3 py-1.5 text-[13.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-45"
            >
              {p.label}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 rounded-full border hairline border-line-strong bg-surface py-1 pr-1 pl-4 focus-within:border-accent">
          <label htmlFor="analyst-q" className="sr-only">
            Ask about this market
          </label>
          <input id="analyst-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} disabled={!context || busy} placeholder="Ask about this report" className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-faint" />
          <Button type="submit" variant="primary" size="sm" iconOnly aria-label="Ask" disabled={!context || busy || !question.trim()}>
            <ArrowUp className="size-4" />
          </Button>
        </form>

        {busy && <LoadingState label="Reading the report" className="px-0" />}

        {!busy && result && 'error' in result && (
          <p className="flex gap-2 rounded-[var(--radius-panel)] bg-negative-soft px-3.5 py-3 text-[14px] text-negative">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {result.error}
          </p>
        )}

        {!busy && result && 'answer' in result && (
          <article className="space-y-5" aria-live="polite">
            <div>
              <p className="label">{result.asked}</p>
              <h3 className="mt-1.5 text-[18px] leading-snug font-medium text-ink">{result.answer.headline}</h3>
            </div>

            <section className={cn('rounded-[var(--radius-panel)] px-4 py-3.5', result.answer.author === 'model' ? 'bg-recessed' : 'border hairline border-line')}>
              <p className="label mb-1.5">{result.answer.author === 'model' ? 'Explanation written by Claude from the data below' : 'Explanation from Korrin’s rules, no model involved'}</p>
              <p className="text-[14.5px] leading-relaxed text-ink-2">{result.answer.explanation}</p>
              {result.answer.fallbackReason && <p className="mt-2 text-[12.5px] text-muted">Model not used: {result.answer.fallbackReason}</p>}
            </section>

            {result.verified.findings.length > 0 && (
              <section>
                <h4 className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
                  <ShieldCheck className="size-4 text-positive" /> Data verified
                </h4>
                <ul className="mt-2 space-y-3">
                  {result.verified.findings.map((f) => (
                    <li key={f.statement} className="text-[14px] leading-snug text-ink">
                      {f.statement}
                      {f.confidence === 'qualified' && <span className="ml-1.5 text-[12px] text-muted">(partial data)</span>}
                      <Evidence paths={f.evidencePaths} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.answer.caveats.length > 0 && (
              <section>
                <h4 className="text-[14px] font-medium text-ink">Qualifying assumptions</h4>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] leading-snug text-ink-2">
                  {result.answer.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </section>
            )}

            {result.verified.action.type !== 'NONE' && (
              <div className="flex flex-wrap gap-2">
                {result.verified.action.type === 'OPEN_REVIEW' && (
                  <Button variant="primary" onClick={onOpenReview}>
                    Open review
                  </Button>
                )}
                {result.verified.action.type === 'APPLY_TO_DRAFT' && result.verified.action.draft && (
                  <Button variant="primary" onClick={() => result.verified.action.draft && onApplyDraft(result.verified.action.draft)}>
                    Apply to draft
                  </Button>
                )}
                <p className="w-full text-[12.5px] text-muted">{result.verified.action.type === 'APPLY_TO_DRAFT' ? 'Opens the draft in What if. Nothing is saved until you save a new plan version.' : 'Opens the order review. You still sign it yourself.'}</p>
              </div>
            )}

            <p className="tabular text-[11.5px] text-muted">
              {result.answer.engineVersion} · reports {result.answer.sourceReportIds.join(', ')}
              {result.answer.wasSimulated ? ' · simulated' : ''}
            </p>
          </article>
        )}
      </div>
    </Drawer>
  )
}

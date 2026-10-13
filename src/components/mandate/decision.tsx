import { ArrowRight, CircleCheck, CircleSlash, Hand, PauseCircle, Plus, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Proposal, ProposalKind } from '@/lib/policy/plan'

const KIND: Record<ProposalKind, { label: string; icon: ReactNode; tone: string }> = {
  PLACE_BID: { label: 'Place bid', icon: <Plus className="size-3.5" />, tone: 'text-bid bg-bid-soft' },
  PLACE_ASK: { label: 'Place ask', icon: <Plus className="size-3.5" />, tone: 'text-ask bg-ask-soft' },
  KEEP: { label: 'Keep orders', icon: <CircleCheck className="size-3.5" />, tone: 'text-positive bg-positive-soft' },
  CANCEL: { label: 'Cancel order', icon: <XCircle className="size-3.5" />, tone: 'text-negative bg-negative-soft' },
  PAUSE: { label: 'Pause market', icon: <PauseCircle className="size-3.5" />, tone: 'text-hold bg-hold-soft' },
  NO_ACTION: { label: 'Waiting', icon: <Hand className="size-3.5" />, tone: 'text-hold bg-hold-soft' },
}

const STEPS = ['What Korrin sees', 'Why it matters', 'Next step'] as const

export function ProposalKindBadge({ kind, className }: { kind: ProposalKind; className?: string }) {
  const k = KIND[kind]
  return (
    <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium', k.tone, className)}>
      {k.icon}
      {k.label}
    </span>
  )
}

function shownKind(proposal: Proposal, paused?: boolean): ProposalKind {
  return paused && proposal.kind !== 'NO_ACTION' ? 'NO_ACTION' : proposal.kind
}

/** Horizontal reasoning strip: what was observed, what it means, and the one proposed step. */
export function DecisionStrip({ proposal, paused, className }: { proposal: Proposal | null; paused?: boolean; className?: string }) {
  if (!proposal) {
    return (
      <div className={cn('flex items-center gap-2 rounded-[var(--radius-panel)] bg-recessed px-4 py-3.5 text-[14px] text-muted', className)}>
        <CircleSlash className="size-4" /> Waiting for a fresh read of the book before deciding.
      </div>
    )
  }
  return (
    <div className={cn('grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-line shadow-[var(--shadow-card)] md:grid-cols-[1fr_1fr_1.15fr]', className)} aria-live="polite">
      <Cell step={STEPS[0]} body={proposal.cause} />
      <Cell step={STEPS[1]} body={proposal.interpretation} />
      <Cell
        step={STEPS[2]}
        body={
          <span className="flex flex-col gap-2">
            <ProposalKindBadge kind={shownKind(proposal, paused)} className="self-start" />
            <span>{proposal.action}</span>
          </span>
        }
        emphasis
      />
    </div>
  )
}

function Cell({ step, body, emphasis }: { step: string; body: ReactNode; emphasis?: boolean }) {
  return (
    <div className={cn('bg-surface px-5 py-4', emphasis && 'bg-raised')}>
      <div className="label mb-1.5 flex items-center gap-1.5">
        {step}
        {step !== STEPS[2] && <ArrowRight className="size-3.5 opacity-50 max-md:hidden" />}
      </div>
      <div className="text-[14.5px] leading-snug text-ink">{body}</div>
    </div>
  )
}

/**
 * The next step as a vertical card with its reasoning and the approval button.
 * The reasoning is always shown, including when Korrin decides to wait.
 */
export function NextOrderCard({
  proposal,
  paused,
  action,
  footnote,
  className,
}: {
  proposal: Proposal | null
  paused?: boolean
  action?: ReactNode
  footnote?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('card flex flex-col', className)} aria-live="polite">
      <header className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 className="title">Next step</h2>
        {proposal && <span className="text-[13px] text-muted">{proposal.requiresApproval && !paused ? 'Needs your signature' : 'Nothing to sign'}</span>}
      </header>
      {!proposal ? (
        <p className="flex items-center gap-2 px-5 pt-3 pb-5 text-[14px] text-muted">
          <CircleSlash className="size-4 shrink-0" /> Waiting for a fresh read of the book before deciding.
        </p>
      ) : (
        <>
          <div className="px-5 pt-3">
            <ProposalKindBadge kind={shownKind(proposal, paused)} />
            <p className="mt-3 text-[16px] leading-snug text-ink">{proposal.action}</p>
          </div>
          <ol className="mt-4 space-y-3 px-5">
            {[
              [STEPS[0], proposal.cause],
              [STEPS[1], proposal.interpretation],
              ...(proposal.nextCondition ? [['Changes when', proposal.nextCondition] as const] : []),
            ].map(([k, v]) => (
              <li key={k} className="hairline-l border-line-strong pl-3">
                <div className="label">{k}</div>
                <div className="mt-0.5 text-[14px] leading-snug text-ink-2">{v}</div>
              </li>
            ))}
          </ol>
        </>
      )}
      {(action || footnote) && (
        <footer className="mt-auto space-y-2.5 px-5 pt-5 pb-5">
          {action}
          {footnote && <div className="text-[13px] leading-snug text-muted">{footnote}</div>}
        </footer>
      )}
    </section>
  )
}

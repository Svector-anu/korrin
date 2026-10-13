'use client'

import { Check, CircleDashed, ExternalLink, Loader2, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { explainError, type Stage, type StageUpdate } from '@/lib/client/execute'
import { useActiveSigner } from '@/lib/client/signer'
import { cn } from '@/lib/cn'
import { explorerTx, NETWORK_LABEL, shortHex } from '@/lib/tempo/chain'
import { Button } from '../ui/button'
import { Modal } from '../ui/overlay'
import { ErrorState } from '../ui/states'

const STEPS: { stage: Stage; label: string; hint: string }[] = [
  { stage: 'signing', label: 'Signing', hint: 'Waiting for your signature' },
  { stage: 'submitted', label: 'Submitted', hint: 'Sent to Tempo' },
  { stage: 'included', label: 'Included', hint: 'In a block, with a receipt' },
  { stage: 'verifying', label: 'Checking the book', hint: 'Reading the DEX back on its own' },
  { stage: 'confirmed', label: 'Verified', hint: 'The DEX matches what you signed' },
]
const ORDER: Stage[] = ['signing', 'submitted', 'included', 'verifying', 'confirmed']

export function StageTracker({ updates }: { updates: StageUpdate[] }) {
  const last = updates.at(-1)
  const reached = (s: Stage) => updates.some((u) => u.stage === s)
  const failedAt = last?.stage === 'failed' || last?.stage === 'unknown' ? ORDER[Math.max(0, ORDER.indexOf(updates.at(-2)?.stage ?? 'signing') + 1)] : null
  const start = updates[0]?.at
  return (
    <ol className="relative space-y-0" aria-label="Transaction progress">
      {STEPS.map((step, i) => {
        const done = reached(step.stage) && last?.stage !== step.stage
        const current = last?.stage === step.stage && step.stage !== 'confirmed'
        const confirmed = step.stage === 'confirmed' && last?.stage === 'confirmed'
        const failed = failedAt === step.stage
        const u = updates.find((x) => x.stage === step.stage)
        return (
          <li key={step.stage} className="relative flex gap-3 pb-3 last:pb-0">
            {i < STEPS.length - 1 && <span className={cn('absolute top-5 left-[9px] h-[calc(100%-12px)] w-px', done || confirmed ? 'bg-positive/50' : 'bg-line')} aria-hidden />}
            <span
              className={cn(
                'relative z-10 mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border hairline transition-colors duration-200',
                (done || confirmed) && 'border-positive bg-positive text-white',
                current && 'border-ink-2 bg-surface text-ink',
                failed && 'border-negative bg-negative text-white',
                !done && !current && !confirmed && !failed && 'border-line-strong bg-surface text-faint',
              )}
            >
              {done || confirmed ? <Check className="size-3" strokeWidth={2.5} /> : current ? <Loader2 className="size-3 animate-spin" /> : failed ? <X className="size-3" strokeWidth={2.5} /> : <CircleDashed className="size-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn('text-[14px]', done || current || confirmed ? 'text-ink' : 'text-muted', failed && 'text-negative')}>{failed ? (last?.stage === 'unknown' ? 'Unresolved' : 'Failed') : step.label}</span>
                {u && start !== undefined && <span className="tabular text-[12.5px] text-muted">+{((u.at - start) / 1000).toFixed(2)}s</span>}
              </div>
              <div className="text-[13px] leading-snug text-muted">
                {failed ? last?.detail : u?.detail ?? (current || !reached(step.stage) ? step.hint : '')}
                {u?.txHash && step.stage === 'submitted' && (
                  <a href={explorerTx(u.txHash)} target="_blank" rel="noreferrer" className="tabular ml-1 inline-flex items-center gap-0.5 text-accent hover:underline">
                    {shortHex(u.txHash, 6, 4)} <ExternalLink className="size-2.5" />
                  </a>
                )}
                {u?.block && step.stage === 'included' && <span className="tabular ml-1">block {u.block.toString()}</span>}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export type DetailRow = { label: string; value: ReactNode; mono?: boolean }

/**
 * One review-and-execute modal for every state-changing action. Nothing is
 * submitted until the operator presses the confirm button, and success is only
 * shown after the independent readback stage.
 */
export function ExecutionFlow({
  open,
  onOpenChange,
  title,
  description,
  rows,
  confirmLabel,
  destructive = false,
  run,
  notice,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  rows: DetailRow[]
  confirmLabel: string
  destructive?: boolean
  run: (onStage: (u: StageUpdate) => void) => Promise<unknown>
  notice?: ReactNode
  onDone?: () => void
}) {
  const signer = useActiveSigner()
  const [updates, setUpdates] = useState<StageUpdate[]>([])
  const [error, setError] = useState<{ title: string; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const last = updates.at(-1)
  const finished = last?.stage === 'confirmed' || last?.stage === 'unknown' || last?.stage === 'failed'

  const reset = () => {
    setUpdates([])
    setError(null)
    setBusy(false)
  }

  const close = () => {
    if (last?.stage === 'confirmed') onDone?.()
    reset()
    onOpenChange(false)
  }

  const go = async () => {
    reset()
    setBusy(true)
    try {
      await run((u) => setUpdates((prev) => [...prev, u]))
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      dismissible={!busy}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={title}
      description={description}
      footer={
        finished ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant={destructive ? 'danger' : 'primary'} onClick={go} loading={busy} disabled={!signer}>
              {busy ? 'Working' : confirmLabel}
            </Button>
          </>
        )
      }
    >
      <dl className="divide-y divide-line-faint rounded-[var(--radius-panel)] bg-recessed px-4">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-[13.5px] text-muted">{r.label}</dt>
            <dd className={cn('min-w-0 truncate text-right text-[14px] text-ink', r.mono && 'tabular text-[13.5px]')}>{r.value}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-[13.5px] text-muted">Signer</dt>
          <dd className="tabular truncate text-right text-[13.5px] text-ink">{signer ? `${shortHex(signer.address, 6, 4)} · ${signer.label}` : 'None connected'}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-[13.5px] text-muted">Network</dt>
          <dd className="text-right text-[14px] text-ink">{NETWORK_LABEL}</dd>
        </div>
      </dl>
      {notice && <div className="mt-3 text-[13.5px] leading-snug text-muted">{notice}</div>}
      {!signer && <ErrorState className="mt-3" title="No signer connected" reason="Connect a browser wallet or create a Korrin testnet signer from the top bar." />}
      {updates.length > 0 && (
        <div className="mt-4">
          <StageTracker updates={updates} />
        </div>
      )}
      {error && !updates.some((u) => u.stage === 'failed') && <ErrorState className="mt-3" title={error.title} reason={error.reason} />}
    </Modal>
  )
}

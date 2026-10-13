import type { MandateStatus } from '@/lib/mandate/types'
import { StatusPill, type Tone } from '../ui/status'

const MAP: Record<MandateStatus, { tone: Tone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  review: { tone: 'neutral', label: 'In review' },
  armed: { tone: 'info', label: 'Armed, no orders yet' },
  active: { tone: 'positive', label: 'Active' },
  paused: { tone: 'hold', label: 'Paused' },
  unwinding: { tone: 'hold', label: 'Unwinding' },
  closed: { tone: 'unknown', label: 'Closed' },
  error: { tone: 'negative', label: 'Needs reconciliation' },
}

export function MandateStatusPill({ status }: { status: MandateStatus }) {
  const s = MAP[status]
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>
}

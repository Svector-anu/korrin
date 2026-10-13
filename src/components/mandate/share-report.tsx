'use client'

import { Check, Copy, Share2 } from 'lucide-react'
import { useState } from 'react'
import { explainError, signText } from '@/lib/client/execute'
import type { TrackedOrder } from '@/lib/client/store'
import { encodeReport, reportMessage } from '@/lib/mandate/report'
import type { LiquidityMandate } from '@/lib/mandate/types'
import { Button } from '../ui/button'
import { Modal } from '../ui/overlay'
import { ErrorState } from '../ui/states'

export function ShareReport({ mandate, orders, disabled }: { mandate: LiquidityMandate; orders: TrackedOrder[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<{ title: string; reason: string } | null>(null)

  const sign = async () => {
    setBusy(true)
    setError(null)
    try {
      const issuedAt = new Date().toISOString()
      const ids = orders.map((o) => o.orderId)
      const { signature, address } = await signText(reportMessage(mandate, ids, issuedAt))
      const payload = encodeReport({
        v: 1,
        mandate,
        orders: orders.map(({ orderId, placedTx, placedBlock, side, tick, flipTick, amount, base, chainId }) => ({ orderId, placedTx, placedBlock, side, tick, flipTick, amount, base, chainId })),
        signedBy: address,
        signature,
        issuedAt,
      })
      setLink(`${window.location.origin}/app/report?d=${payload}`)
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" icon={<Share2 className="size-3.5" />} disabled={disabled} onClick={() => setOpen(true)}>
        Share report
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) {
            setLink(null)
            setError(null)
          }
        }}
        title="Share a read-only report"
        description="Anyone with the link sees this market’s range, orders and next step, read live from Tempo. Your signature proves the plan came from you. The link can’t sign anything."
        footer={
          link ? (
            <Button
              variant="primary"
              icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              onClick={async () => {
                await navigator.clipboard.writeText(link)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={busy} onClick={sign}>
                Sign and create link
              </Button>
            </>
          )
        }
      >
        <p className="text-[13.5px] leading-snug text-muted">
          You sign a plain message with the plan ID, chain and {orders.length} order {orders.length === 1 ? 'ID' : 'IDs'}. No transaction is sent.
        </p>
        {link && (
          <div className="mt-3 rounded-[var(--radius-panel)] bg-recessed p-3">
            <a href={link} target="_blank" rel="noreferrer" className="tabular block truncate text-[13px] text-accent hover:underline">
              {link}
            </a>
          </div>
        )}
        {error && <ErrorState className="mt-3" title={error.title} reason={error.reason} />}
      </Modal>
    </>
  )
}

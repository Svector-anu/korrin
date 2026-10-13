import type { Metadata } from 'next'
import { ExternalLink } from 'lucide-react'
import { SessionPlayer } from '@/components/session/session-player'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/panel'
import { SESSION } from '@/lib/evidence/session'
import { explorerAddress, shortHex } from '@/lib/tempo/chain'

export const metadata: Metadata = { title: 'Recorded session' }

export default function SessionPage() {
  const captured = new Date(SESSION.capturedAt).toUTCString().replace(' GMT', ' UTC')
  return (
    <>
      <PageHeader
        title="Recorded session"
        description={
          <>
            A real market session recorded on {SESSION.network.name} on {captured}. Every bar, order and decision below was read from chain at the time. Step through it without a wallet. Each transaction links to the explorer.
          </>
        }
        actions={
          <ButtonLink href="/app/mandates/new" variant="primary">
            Set up your own
          </ButtonLink>
        }
      />
      <SessionPlayer />
      <p className="mt-6 max-w-[80ch] text-[13.5px] leading-relaxed text-muted">
        {SESSION.disclosure} Maker{' '}
        <a className="tabular text-ink-2 hover:text-accent" href={explorerAddress(SESSION.maker)} target="_blank" rel="noreferrer">
          {shortHex(SESSION.maker, 4, 4)} <ExternalLink className="inline size-3" />
        </a>
        , test taker{' '}
        <a className="tabular text-ink-2 hover:text-accent" href={explorerAddress(SESSION.taker)} target="_blank" rel="noreferrer">
          {shortHex(SESSION.taker, 4, 4)} <ExternalLink className="inline size-3" />
        </a>
        . Decisions were produced by the same planner the app runs, against the observation shown at each step.
      </p>
    </>
  )
}

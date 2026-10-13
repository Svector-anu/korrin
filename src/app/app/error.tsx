'use client'

import { Button, ButtonLink } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/states'

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl py-10">
      <ErrorState
        title="This screen failed to render"
        reason={`${error.message}${error.digest ? ` (digest ${error.digest})` : ''}. Nothing was signed or sent. Chain state is unaffected.`}
        recovery={
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={reset}>
              Try again
            </Button>
            <ButtonLink size="sm" href="/app">
              Overview
            </ButtonLink>
          </div>
        }
      />
    </div>
  )
}

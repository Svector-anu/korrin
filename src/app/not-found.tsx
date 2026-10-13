import { KorrinWordmark } from '@/components/shell/logo'
import { ButtonLink } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-start justify-center gap-6 px-6 md:px-16">
      <KorrinWordmark />
      <div>
        <h1 className="display">Nothing rests at this address.</h1>
        <p className="prose-body mt-3 max-w-[48ch] text-muted">This page doesn’t exist. Your markets, the order books and the recorded session are one click away.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/app" variant="primary">
          Open the workspace
        </ButtonLink>
        <ButtonLink href="/">Back to the homepage</ButtonLink>
      </div>
    </main>
  )
}

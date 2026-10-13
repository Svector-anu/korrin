import type { Address } from 'viem'
import { cn } from '@/lib/cn'
import { CHAIN_ID } from '@/lib/tempo/chain'
import { tokenDisplay } from '@/lib/tokens/registry'

function monogram(symbol: string) {
  const letters = symbol.replace(/[^a-zA-Z0-9]/g, '')
  return (letters.slice(0, 2) || '?').toUpperCase()
}

/** Token logo from Tempo's official token list, or a neutral monogram for unlisted tokens. */
export function TokenIcon({ address, symbol, size = 20, className }: { address: Address | string; symbol?: string; size?: number; className?: string }) {
  const t = tokenDisplay(CHAIN_ID, address, symbol)
  if (t.icon) {
    return (
      // biome-ignore lint/performance/noImgElement: tiny local SVGs, next/image adds nothing here
      <img src={t.icon} alt="" width={size} height={size} className={cn('shrink-0 rounded-full bg-surface ring-1 ring-line', className)} style={{ width: size, height: size }} />
    )
  }
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-recessed font-medium text-ink-2 ring-1 ring-line-strong', className)}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.38) }}
    >
      {monogram(t.symbol)}
    </span>
  )
}

export function TokenPair({ base, quote, size = 20, className }: { base: { address: Address | string; symbol: string }; quote: { address: Address | string; symbol: string }; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center', className)}>
      <TokenIcon address={base.address} symbol={base.symbol} size={size} className="relative z-10" />
      <TokenIcon address={quote.address} symbol={quote.symbol} size={size} className="-ml-[30%] ring-2 ring-surface" />
    </span>
  )
}

export function PairLabel({
  base,
  quote,
  size = 20,
  className,
  labelClassName = 'font-medium text-ink',
}: {
  base: { address: Address | string; symbol: string }
  quote: { address: Address | string; symbol: string }
  size?: number
  className?: string
  labelClassName?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <TokenPair base={base} quote={quote} size={size} />
      <span className={cn('truncate', labelClassName)}>
        {base.symbol}
        <span className="text-muted"> / {quote.symbol}</span>
      </span>
    </span>
  )
}

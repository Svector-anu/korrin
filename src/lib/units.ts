export function toUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid amount "${value}"`)
  const [whole, fraction = ''] = trimmed.split('.')
  if (fraction.length > decimals) throw new Error(`"${value}" has more than ${decimals} decimals`)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
}

export function tryToUnits(value: string, decimals: number): bigint | null {
  try {
    return toUnits(value, decimals)
  } catch {
    return null
  }
}

export function fromUnits(value: bigint, decimals: number): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const fraction = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** Fixed-precision display with grouping, e.g. 1,250.00. Never rounds up past the real value's precision. */
export function formatAmount(value: bigint, decimals: number, precision = 2): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const base = 10n ** BigInt(decimals)
  const scaled = (abs * 10n ** BigInt(precision)) / base
  const whole = scaled / 10n ** BigInt(precision)
  const fraction = precision > 0 ? (scaled % 10n ** BigInt(precision)).toString().padStart(precision, '0') : ''
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '−' : ''}${grouped}${fraction ? `.${fraction}` : ''}`
}

export function formatCompact(value: bigint, decimals: number): string {
  const n = Number(value) / 10 ** decimals
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: n < 100 ? 2 : 0 })
}

export function minBigint(...values: bigint[]): bigint {
  return values.reduce((a, b) => (b < a ? b : a))
}

export function maxBigint(...values: bigint[]): bigint {
  return values.reduce((a, b) => (b > a ? b : a))
}

import { getKv } from './kv'

/** Error codes from PRD v2 §13.3. */
export type ApiErrorCode =
  | 'UNSUPPORTED_PAIR'
  | 'INVALID_INPUT'
  | 'STALE_SNAPSHOT'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_NOT_VERIFIED'
  | 'PAYMENT_ALREADY_USED'
  | 'PAYMENT_NOT_CONFIGURED'
  | 'ENTITLEMENT_REQUIRED'
  | 'REPORT_NOT_FOUND'
  | 'REPORT_TEMPORARILY_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'AGENT_OUTPUT_INVALID'

const STATUS: Record<ApiErrorCode, number> = {
  UNSUPPORTED_PAIR: 404,
  INVALID_INPUT: 400,
  STALE_SNAPSHOT: 503,
  PAYMENT_REQUIRED: 402,
  PAYMENT_NOT_VERIFIED: 402,
  PAYMENT_ALREADY_USED: 409,
  PAYMENT_NOT_CONFIGURED: 503,
  ENTITLEMENT_REQUIRED: 401,
  REPORT_NOT_FOUND: 404,
  REPORT_TEMPORARILY_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  UPSTREAM_TIMEOUT: 503,
  AGENT_OUTPUT_INVALID: 502,
}

const RETRYABLE = new Set<ApiErrorCode>(['STALE_SNAPSHOT', 'REPORT_TEMPORARILY_UNAVAILABLE', 'RATE_LIMITED', 'UPSTREAM_TIMEOUT'])

export const traceId = () => `trc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

export const API_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'x-korrin-api': 'v1' }

export function apiJson(data: unknown, init: ResponseInit & { trace?: string } = {}): Response {
  const { trace, ...rest } = init
  return new Response(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    ...rest,
    headers: { ...API_HEADERS, 'cache-control': 'no-store', ...(trace ? { 'x-korrin-trace': trace } : {}), ...rest.headers },
  })
}

export function apiError(code: ApiErrorCode, message: string, options: { trace?: string; details?: Record<string, unknown>; headers?: HeadersInit } = {}): Response {
  const trace = options.trace ?? traceId()
  return apiJson({ error: { code, message, retryable: RETRYABLE.has(code), traceId: trace, ...(options.details ? { details: options.details } : {}) } }, { status: STATUS[code], trace, headers: options.headers })
}

const memoryWindows = new Map<string, { count: number; resetAt: number }>()

/** Fixed-window limiter per client and route. Shared through Upstash when configured. */
export async function rateLimit(request: Request, route: string, limit: number, windowSeconds = 60): Promise<{ ok: boolean; remaining: number; resetSeconds: number }> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local'
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds)
  const key = `korrin:rl:${route}:${ip}:${bucket}`
  const resetSeconds = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds)
  const kv = getKv()
  let count: number
  if (kv) {
    try {
      count = await kv.incr(key)
      if (count === 1) await kv.expire(key, windowSeconds)
    } catch {
      return { ok: true, remaining: limit, resetSeconds }
    }
  } else {
    const entry = memoryWindows.get(key) ?? { count: 0, resetAt: Date.now() + windowSeconds * 1000 }
    entry.count++
    memoryWindows.set(key, entry)
    for (const [k, v] of memoryWindows) if (v.resetAt < Date.now()) memoryWindows.delete(k)
    count = entry.count
  }
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetSeconds }
}

export function rateLimited(resetSeconds: number, trace?: string): Response {
  return apiError('RATE_LIMITED', `Too many requests. Try again in ${resetSeconds}s.`, { trace, headers: { 'retry-after': String(resetSeconds) } })
}

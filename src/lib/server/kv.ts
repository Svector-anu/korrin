import { Redis } from '@upstash/redis'
import type { Store } from 'mppx'

/**
 * Shared Upstash Redis store. The Vercel Marketplace integration injects either
 * KV_REST_API_* or UPSTASH_REDIS_REST_* variables; both are accepted. Returns null
 * when neither is configured, and callers must then refuse paid flows rather than
 * fall back to per-instance memory.
 */
let cached: Redis | null | undefined

export function getKv(): Redis | null {
  if (cached !== undefined) return cached
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  cached = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null
  return cached
}

const CAS = `
local current = redis.call('GET', KEYS[1])
if (current == false and ARGV[1] == '') or current == ARGV[1] then
  if ARGV[2] == 'set' then redis.call('SET', KEYS[1], ARGV[3]) elseif ARGV[2] == 'delete' then redis.call('DEL', KEYS[1]) end
  return 1
end
return 0`

/**
 * mppx AtomicStore over Upstash. `update` is a compare-and-set loop (Lua EVAL) so
 * concurrent replay checks across serverless instances cannot both succeed;
 * `tryClaim` is a single `SET NX PXAT`.
 */
export function mppxStore(redis: Redis): Store.AtomicStore {
  const encode = (v: unknown) => JSON.stringify(v)
  const decode = (raw: string | null) => (raw === null ? null : JSON.parse(raw))
  return {
    async get(key) {
      return decode(await redis.get<string>(key))
    },
    async put(key, value) {
      await redis.set(key, encode(value))
    },
    async delete(key) {
      await redis.del(key)
    },
    async update(key, fn) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const raw = await redis.get<string>(key)
        const change = fn(decode(raw))
        if (change.op === 'noop') return change.result
        const ok = await redis.eval(CAS, [key], [raw ?? '', change.op, change.op === 'set' ? encode(change.value) : ''])
        if (ok === 1) return change.result
      }
      throw new Error(`Store update for ${key} lost the race 8 times`)
    },
    async tryClaim(key, expires) {
      const res = await redis.set(key, encode({ type: 'mppx:replay', expires }), { nx: true, pxat: expires })
      return res === 'OK'
    },
  }
}

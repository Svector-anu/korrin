export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    ...init,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...init?.headers },
  })
}

export function jsonError(message: string, status = 502): Response {
  return json({ error: message }, { status })
}

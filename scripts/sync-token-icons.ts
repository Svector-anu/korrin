/**
 * Syncs Tempo's official token lists and their logos into the repo so the app
 * never hotlinks icons at runtime. Re-run when the upstream list changes:
 *   pnpm tsx scripts/sync-token-icons.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type ListToken = { chainId: number; address: string; name: string; symbol: string; decimals: number; logoURI?: string }
type TokenList = { name: string; timestamp: string; version: { major: number; minor: number; patch: number }; tokens: ListToken[] }

const CHAINS = [42431, 4217]
const root = process.cwd()

const main = async () => {
  const registry: Record<string, { name: string; symbol: string; decimals: number; icon: string | null; chainId: number }> = {}
  const sources: { chainId: number; name: string; version: string; timestamp: string; url: string }[] = []
  for (const chainId of CHAINS) {
    const url = `https://tokenlist.tempo.xyz/list/${chainId}`
    const list = (await (await fetch(url)).json()) as TokenList
    sources.push({ chainId, name: list.name, version: `${list.version.major}.${list.version.minor}.${list.version.patch}`, timestamp: list.timestamp, url })
    const dir = join(root, 'public', 'tokens', String(chainId))
    mkdirSync(dir, { recursive: true })
    for (const t of list.tokens) {
      const address = t.address.toLowerCase()
      let icon: string | null = null
      if (t.logoURI) {
        const res = await fetch(t.logoURI)
        const type = res.headers.get('content-type') ?? ''
        const body = Buffer.from(await res.arrayBuffer())
        if (res.ok && type.includes('svg') && body.toString('utf8').includes('<svg') && !/<script/i.test(body.toString('utf8'))) {
          writeFileSync(join(dir, `${address}.svg`), body)
          icon = `/tokens/${chainId}/${address}.svg`
        } else if (res.ok && type.startsWith('image/')) {
          const ext = type.split('/')[1].split(';')[0].replace('jpeg', 'jpg')
          writeFileSync(join(dir, `${address}.${ext}`), body)
          icon = `/tokens/${chainId}/${address}.${ext}`
        } else {
          console.warn(`skip icon ${t.symbol} ${res.status} ${type}`)
        }
      }
      registry[`${chainId}:${address}`] = { chainId, name: t.name, symbol: t.symbol, decimals: t.decimals, icon }
      console.log(chainId, t.symbol.padEnd(10), icon ?? 'no icon')
    }
  }
  const out = join(root, 'src', 'lib', 'tokens')
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'tokenlist.generated.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sources, tokens: registry }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

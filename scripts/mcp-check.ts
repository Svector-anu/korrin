/**
 * Calls Korrin's MCP endpoint with the official SDK client and prints each tool's
 * result, including the refusals for paid and private tools without access.
 *
 *   pnpm tsx scripts/mcp-check.ts [baseUrl]
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const BASE = process.argv[2] ?? 'http://localhost:3100'

const main = async () => {
  const client = new Client({ name: 'korrin-mcp-check', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)))
  const { tools } = await client.listTools()
  console.log('tools:', tools.map((t) => `${t.name}${t.annotations?.readOnlyHint ? ' (read-only)' : ''}`).join(', '))
  const calls: [string, Record<string, unknown>][] = [
    ['list_supported_markets', {}],
    ['get_market_health_preview', { marketId: 'tempo-moderato:betausd-pathusd' }],
    ['get_market_exceptions', { marketId: 'tempo-moderato:alphausd-pathusd' }],
    ['get_market_health', { marketId: 'tempo-moderato:betausd-pathusd' }],
    ['get_mandate_status', { mandateId: 'anything' }],
  ]
  for (const [name, args] of calls) {
    const res = await client.callTool({ name, arguments: args })
    const text = (res.content as { type: string; text: string }[])[0]?.text ?? ''
    console.log(`\n# ${name} ${res.isError ? '(refused)' : ''}\n${text.slice(0, 700)}`)
  }
  await client.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})

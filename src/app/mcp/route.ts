import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createKorrinMcpServer } from '@/lib/mcp/server'
import { rateLimit, rateLimited } from '@/lib/server/api'

/** Stateless Streamable HTTP MCP endpoint: a fresh server and transport per request. */
async function handle(request: Request): Promise<Response> {
  const limit = await rateLimit(request, 'mcp', 60)
  if (!limit.ok) return rateLimited(limit.resetSeconds)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  const server = createKorrinMcpServer()
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    await server.close()
  }
}

export const POST = handle
export const GET = handle
export const DELETE = handle

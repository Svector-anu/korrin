import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { LivePreview } from '@/components/developers/live-preview'
import { SiteNav } from '@/components/landing/site-nav'
import { StatusPill } from '@/components/ui/status'
import { CHALLENGE_TTL_MINUTES, paidApiStatus } from '@/lib/server/mpp'

export const metadata: Metadata = { title: 'Market intelligence API', description: 'Korrin’s Liquidity Health Reports for Tempo stablecoin markets, over HTTP and MCP, paid per report with MPP.' }

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-[var(--radius-panel)] bg-recessed px-4 py-3.5 text-[13px] leading-relaxed text-ink-2">{children}</pre>
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-12">
      <h2 className="heading text-structural">{title}</h2>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}

const ENDPOINTS = [
  { method: 'GET', path: '/v1', access: 'Public', what: 'Discovery document: endpoints, price, network.' },
  { method: 'GET', path: '/v1/markets', access: 'Public', what: 'Supported markets with IDs and best prices.' },
  { method: 'GET', path: '/v1/markets/{marketId}/health/preview', access: 'Public', what: 'Free summary: quality, best prices, spread, levels read.' },
  { method: 'GET', path: '/v1/intelligence/markets/{marketId}/health', access: 'MPP', what: 'The full, immutable report for the current block.' },
  { method: 'GET', path: '/v1/reports/{reportId}', access: 'Entitlement', what: 'Fetch a report you already paid for. Never charges.' },
  { method: 'POST', path: '/mcp', access: 'Public / entitlement', what: 'Read-only MCP tools over Streamable HTTP.' },
]

const ERRORS: [string, string, string][] = [
  ['UNSUPPORTED_PAIR', '404', 'The market ID is not one Korrin reports on.'],
  ['INVALID_INPUT', '400', 'A parameter is malformed, such as bandBps outside 1 to 50.'],
  ['PAYMENT_REQUIRED', '402', 'No credential. The response carries the MPP challenge.'],
  ['PAYMENT_NOT_VERIFIED', '402', 'The credential failed verification. Nothing is delivered.'],
  ['ENTITLEMENT_REQUIRED', '401', 'Retrieval without a valid token or credential.'],
  ['REPORT_NOT_FOUND', '404', 'The pinned report expired before payment. Nothing was charged.'],
  ['REPORT_TEMPORARILY_UNAVAILABLE', '503', 'The market could not be read. No challenge is issued.'],
  ['PAYMENT_NOT_CONFIGURED', '503', 'Paid reports are switched off on this deployment.'],
  ['RATE_LIMITED', '429', 'Too many requests. Honour retry-after.'],
]

export default function DevelopersPage() {
  const paid = paidApiStatus()
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteNav />
      <main className="mx-auto w-full max-w-[1040px] px-4 pt-32 pb-28 md:px-6">
        <header className="max-w-[720px]">
          <h1 className="display text-structural">Market intelligence API</h1>
          <p className="prose-body mt-5 text-[17px]">The same Liquidity Health Report the Korrin app shows, for any agent or service: executable depth in a price band, read from Tempo’s DEX, with every unknown marked as unknown. Previews are free. A full report costs one MPP payment and can be fetched again without paying twice.</p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-[14px]">
            <StatusPill tone="neutral">Tempo Moderato testnet</StatusPill>
            {paid.enabled ? <StatusPill tone="positive">Paid reports on: {paid.price} pathUSD</StatusPill> : <StatusPill tone="hold">Paid reports off on this deployment</StatusPill>}
          </div>
        </header>

        <div className="mt-14 space-y-14">
          <Section id="try" title="Try the free preview">
            <LivePreview />
          </Section>

          <Section id="endpoints" title="Endpoints">
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-[14px]">
                <thead>
                  <tr className="text-left text-[13px] text-muted">
                    {['Endpoint', 'Access', 'Returns'].map((h) => (
                      <th key={h} className="px-5 py-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map((e) => (
                    <tr key={e.path} className="border-t border-line-faint">
                      <td className="tabular px-5 py-3 text-ink">
                        <span className="mr-2 text-muted">{e.method}</span>
                        {e.path}
                      </td>
                      <td className="px-5 py-3 text-ink-2">{e.access}</td>
                      <td className="px-5 py-3 text-ink-2">{e.what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="mpp" title="Paying with MPP">
            <ol className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-line md:grid-cols-4">
              {[
                ['Challenge', 'Request the report. Korrin pins an immutable report and answers 402 with a tempo.charge challenge bound to its report ID.'],
                ['Payment', `Your client checks the price and pays ${paid.price} pathUSD on Moderato before the challenge expires (${CHALLENGE_TTL_MINUTES} minutes).`],
                ['Verified', 'The server verifies the payment with mppx and records one entitlement per payment reference.'],
                ['Report ready', 'You get the report, a Payment-Receipt header and a Korrin-Entitlement token for fetching it again.'],
              ].map(([t, b], i) => (
                <li key={t} className="bg-surface p-5">
                  <span className="tabular flex size-7 items-center justify-center rounded-full bg-recessed text-[13px] text-ink-2">{i + 1}</span>
                  <h3 className="mt-3 text-[16px] font-medium text-ink">{t}</h3>
                  <p className="mt-1.5 text-[14px] leading-snug text-ink-2">{b}</p>
                </li>
              ))}
            </ol>
            <p className="text-[14.5px] leading-relaxed text-ink-2">
              Retrying with the same credential returns the same report and receipt without a second charge, so a dropped connection after payment never costs twice. A report is fixed before you pay: paying for an older challenge gets you that report, not a newer one, and the response tells you its age. The price is a testnet value for proving the flow, not a commercial price.
            </p>
            <Code>{`import { Mppx, tempo } from 'mppx/client'
import { privateKeyToAccount } from 'viem/accounts'

const mppx = Mppx.create({ methods: [tempo({ account: privateKeyToAccount(process.env.KEY) })], polyfill: false })
const url = 'https://korrin-steel.vercel.app/v1/intelligence/markets/tempo-moderato:betausd-pathusd/health'

const challenge = await mppx.rawFetch(url)            // 402 with the MPP challenge
const credential = await mppx.createCredential(challenge)
const res = await fetch(url, { headers: { authorization: credential } })
const { report, entitlement } = await res.json()      // also: res.headers.get('payment-receipt')

// Later, without paying again:
await fetch(\`https://korrin-steel.vercel.app/v1/reports/\${report.reportId}\`, {
  headers: { 'korrin-entitlement': entitlement.retrieve.token },
})`}</Code>
            <p className="text-[14px] text-muted">
              A complete client that also checks retries, tampering and concurrency is in the repository at <span className="tabular text-ink-2">scripts/mpp-buy-report.ts</span>.
            </p>
          </Section>

          <Section id="mcp" title="MCP">
            <p className="text-[14.5px] leading-relaxed text-ink-2">Point any MCP client at the Streamable HTTP endpoint. Every tool is read-only; none can sign, trade or read an operator’s private plan.</p>
            <Code>{`{ "mcpServers": { "korrin": { "url": "https://korrin-steel.vercel.app/mcp" } } }`}</Code>
            <ul className="grid gap-2 text-[14px] text-ink-2 md:grid-cols-2">
              {[
                ['list_supported_markets', 'free'],
                ['get_market_health_preview', 'free'],
                ['get_market_exceptions', 'free'],
                ['get_market_health', 'needs an entitlement token'],
                ['get_liquidity_coverage', 'needs an entitlement token'],
                ['explain_liquidity_change', 'needs two entitlement tokens'],
                ['get_mandate_status', 'always refuses: private plans are not exposed'],
              ].map(([t, a]) => (
                <li key={t} className="flex justify-between gap-3 rounded-[var(--radius-panel)] bg-recessed px-3.5 py-2.5">
                  <span className="tabular text-ink">{t}</span>
                  <span className="text-right text-muted">{a}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="report" title="What a report contains">
            <ul className="space-y-2.5 text-[14.5px] leading-snug text-ink-2">
              <li>Network, market and the block the book was read at. Freshness is computed when you read it, so the report body never changes.</li>
              <li>Bid and ask depth inside the band. Price levels the RPC cannot read make the total unknown, with a lower bound. They are never counted as zero.</li>
              <li>Quality (HIGH, DEGRADED or UNAVAILABLE) with the reasons, best prices, spread and book shape.</li>
              <li>A keccak256 digest over the canonical body. The report ID is derived from it, so any edit is detectable.</li>
              <li>Public reports never include anyone’s plan, orders or balances. Those appear only inside the operator’s own workspace.</li>
            </ul>
          </Section>

          <Section id="errors" title="Errors">
            <p className="text-[14.5px] text-ink-2">
              Every error is <span className="tabular text-ink">{'{ error: { code, message, retryable, traceId } }'}</span>.
            </p>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-[14px]">
                <tbody>
                  {ERRORS.map(([code, status, what]) => (
                    <tr key={code} className="border-t border-line-faint first:border-t-0">
                      <td className="tabular px-5 py-3 text-ink">{code}</td>
                      <td className="tabular px-5 py-3 text-muted">{status}</td>
                      <td className="px-5 py-3 text-ink-2">{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <p className="text-[13.5px] text-muted">
            Testnet only. Reports describe resting orders at one block and are not a guarantee of future liquidity, a peg, or a price. See the{' '}
            <Link href="/" className="underline decoration-line-strong underline-offset-4 hover:text-ink">
              product
            </Link>{' '}
            for how operators use the same reports.
          </p>
        </div>
      </main>
    </div>
  )
}

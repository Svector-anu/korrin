import { Ban, CircleDashed, Pause, Undo2 } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { LiquidityCorridor } from '@/components/corridor/liquidity-corridor'
import { ReportPanel } from '@/components/health/report-panel'
import { LifecycleStory } from '@/components/landing/lifecycle-story'
import { Reveal } from '@/components/landing/reveal'
import { SiteNav } from '@/components/landing/site-nav'
import { SessionPlayer } from '@/components/session/session-player'
import { KorrinWordmark } from '@/components/shell/logo'
import { ButtonLink } from '@/components/ui/button'
import { SourceBadge, StatusPill } from '@/components/ui/status'
import { TokenIcon } from '@/components/ui/token'
import { TooltipProvider } from '@/components/ui/tooltip'
import { frameCorridor, SESSION } from '@/lib/evidence/session'
import { frameHealthReport } from '@/lib/health/replay'
import { formatTickPrice } from '@/lib/market/ticks'
import { CHAIN_ID, DEX_ADDRESS, EXPLORER_URL, explorerAddress, NETWORK_LABEL, RPC_HOST, shortHex } from '@/lib/tempo/chain'
import { formatAmount } from '@/lib/units'

const REPO_URL = 'https://github.com/winsznx/korrin'

const m = SESSION.mandate
const placed = SESSION.frames[1]
const orderId = placed.orders[0]?.orderId ?? ''
const placedCorridor = frameCorridor(SESSION, placed)
const sampleReport = frameHealthReport(SESSION, placed, { chainId: CHAIN_ID, name: NETWORK_LABEL, environment: 'testnet', explorer: EXPLORER_URL, rpcHost: RPC_HOST })

function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-[1240px] scroll-mt-16 px-4 md:px-6 ${className ?? ''}`}>
      {children}
    </section>
  )
}

const CLAIMS: [string, string, 'verified' | 'not observed' | 'unproven' | 'hypothesis' | 'no'][] = [
  ['A real flip order is placed, read back and cancelled', 'Scripted runs plus a browser end-to-end run, reports/LIVE_RUN.md', 'verified'],
  ['A filled flip order keeps its ID and swaps sides', `Order ${orderId}, two flips, OrderFlipped plus getOrder`, 'verified'],
  ['Cancel returns funds to the DEX balance, not the wallet', 'Balance changes in reports/SPONSOR_FINDINGS.md', 'verified'],
  ['Korrin waits on stale data, wrong chain, paused tokens or unknown orders', '24 planner tests in src/lib/policy', 'verified'],
  ['Health reports never double count or turn unknowns into zero', '23 engine tests in src/lib/health, plus live reads', 'verified'],
  ['The analyst only states numbers that are in the report', '5 live cases over recorded snapshots and validator tests', 'verified'],
  ['FlipFailed is handled', 'Handled in code, never observed on Moderato', 'not observed'],
  ['Target-driven quoting beats a static order', 'No controlled comparison yet', 'unproven'],
  ['Issuers want this', 'A hypothesis. No customer conversations yet', 'hypothesis'],
  ['Safe for real funds', 'Not audited. Testnet only', 'no'],
]

const CLAIM_LABEL = { verified: 'Verified', 'not observed': 'Not observed', unproven: 'Unproven', hypothesis: 'Hypothesis', no: 'Not claimed' } as const

export default function Home() {
  const walletPath = BigInt(SESSION.frames[0].balances.find((b) => b.token.toLowerCase().endsWith('0000'))?.wallet ?? '0')
  const bids = placed.book.levels
    .filter((l) => l.isBid && l.status === 'ok' && l.liquidity && BigInt(l.liquidity) > 0n)
    .sort((a, b) => b.tick - a.tick)
    .slice(0, 6)
  const cov = placedCorridor.coverage
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteNav />

      {/* One screen, one idea: the statement on the left, a real recorded session on the right. */}
      <Section className="flex min-h-svh items-center pt-24 pb-14">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="min-w-0 max-w-[600px]">
            <StatusPill tone="positive">Live on Tempo testnet</StatusPill>
            <h1 className="display-xl mt-6 text-structural">Put your stablecoin liquidity on the book.</h1>
            <p className="prose-body mt-6 max-w-[50ch] text-[18px] leading-[1.6]">Korrin gives stablecoin operators a measurable view of the liquidity their market can actually execute, and the controls to maintain it within the limits they set. Every order is yours to approve and is checked against Tempo’s order book.</p>
            <p className="mt-4 max-w-[52ch] text-[14.5px] leading-snug text-muted">Built for smaller stablecoin issuers and professional liquidity operators who manage a pair on Tempo today.</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="/app/session" variant="primary" size="lg">
                Watch a recorded session
              </ButtonLink>
              <ButtonLink href="/app/mandates/new" size="lg">
                Set up a market
              </ButtonLink>
            </div>
            <p className="mt-6 text-[14px] text-muted">
              Or open a{' '}
              <Link href="/report/live" className="text-ink-2 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink">
                signed report of an order resting on Tempo right now
              </Link>
              .
            </p>
          </div>
          <div className="min-w-0 rounded-[24px] bg-recessed p-2 md:p-3">
            <div className="rounded-[18px] bg-surface p-4 shadow-[var(--shadow-widget)] md:p-5">
              <SessionPlayer compact autoPlay initialIndex={1} />
            </div>
          </div>
        </div>
      </Section>

      {/* A balance and a market are different things: small wallet card, large book card. */}
      <Section id="why" className="py-24">
        <Reveal>
          <h2 className="display max-w-[18ch]">A balance isn’t liquidity.</h2>
          <p className="prose-body mt-5 max-w-[56ch]">A treasury can hold a million stablecoins and still leave its market empty. Traders can only swap against orders resting on the book, close enough to parity to be worth taking.</p>
        </Reveal>
        <Reveal delay={60}>
          <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className="card flex flex-col p-7">
              <span className="flex items-center gap-2.5 text-[15px] text-ink-2">
                <TokenIcon address="0x20c0000000000000000000000000000000000000" size={24} />
                Held in a wallet
              </span>
              <span className="figure mt-8 text-[64px] text-ink">{formatAmount(walletPath, 6, 0)}</span>
              <span className="mt-2 text-[15px] text-muted">PathUSD</span>
              <div className="flex-1" />
              <p className="mt-10 text-[15px] leading-snug text-ink-2">Nobody can trade against it. It moves the book by exactly zero.</p>
            </div>
            <div className="card p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-[15px] text-ink-2">
                  <TokenIcon address={m.base.address} size={24} />
                  Resting on the AlphaUSD book
                </span>
                <span className="tabular text-[13px] text-muted">block {Number(placed.book.blockNumber).toLocaleString('en-US')}</span>
              </div>
              <ul className="mt-6 space-y-1.5">
                {bids.map((l) => {
                  const own = l.tick === placed.orders[0]?.tick
                  const size = Number(BigInt(l.liquidity ?? '0') / 1_000_000n)
                  const widest = Math.max(...bids.map((b) => Number(BigInt(b.liquidity ?? '0') / 1_000_000n)))
                  return (
                    <li key={l.tick} className={`relative overflow-hidden rounded-[10px] px-4 py-2.5 ${own ? 'bg-bid-soft' : 'bg-recessed'}`}>
                      <span aria-hidden className={`absolute inset-y-0 left-0 ${own ? 'bg-bid/20' : 'bg-bid-soft'}`} style={{ width: `${Math.max(4, (Math.log10(size + 1) / Math.log10(widest + 1)) * 100)}%` }} />
                      <span className="tabular relative flex items-center justify-between text-[14.5px]">
                        <span className={own ? 'text-bid' : 'text-ink-2'}>{formatTickPrice(l.tick)}</span>
                        <span className={own ? 'text-bid' : 'text-ink'}>
                          {own && <span className="mr-3 rounded-full bg-surface px-2 py-0.5 text-[12.5px]">Korrin order #{orderId}</span>}
                          {formatAmount(BigInt(l.liquidity ?? '0'), 6, 0)}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-5 text-[14px] leading-snug text-muted">Bids on AlphaUSD/PathUSD, read from Tempo’s DEX. Each row is real depth at one price. The highlighted one is the order Korrin placed.</p>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* The instrument: one large corridor with two small cards that each answer one question. */}
      <Section id="how" className="py-24">
        <Reveal>
          <h2 className="display max-w-[20ch]">See your target and what’s really on the book.</h2>
          <p className="prose-body mt-5 max-w-[58ch]">You set a target price, how far either side to quote, and how much. The liquidity corridor draws that range over the live book, so a missing side is obvious at a glance.</p>
        </Reveal>
        <Reveal delay={60}>
          <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="card min-w-0 p-3 md:p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                <span className="text-[15px] font-medium text-ink">{m.name}</span>
                <SourceBadge source="replay" />
              </div>
              <LiquidityCorridor model={placedCorridor} height={380} />
            </div>
            <div className="grid min-w-0 gap-5">
              <div className="card p-6">
                <h3 className="title">What you set</h3>
                <dl className="mt-4 space-y-2.5 text-[14.5px]">
                  {[
                    ['Target', formatTickPrice(m.targetTick)],
                    ['Range', `${formatTickPrice(m.targetTick - m.bandTicks)} to ${formatTickPrice(m.targetTick + m.bandTicks)}`],
                    ['Quotes at', `${formatTickPrice(m.targetTick - m.quoteOffsetTicks)} and ${formatTickPrice(m.targetTick + m.quoteOffsetTicks)}`],
                    ['Per side', `${formatAmount(BigInt(m.targetBidDepth), 6, 0)} AlphaUSD`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-muted">{k}</dt>
                      <dd className="tabular text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="card p-6">
                <h3 className="title">What Korrin found</h3>
                {cov && (
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    {(['bid', 'ask'] as const).map((side) => (
                      <div key={side}>
                        <div className="text-[13.5px] text-muted">{side === 'bid' ? 'Bids' : 'Asks'} on the book</div>
                        <div className={`figure mt-2 text-[32px] ${side === 'bid' ? 'text-bid' : 'text-ask'}`}>{formatAmount(cov[side].own, 6, 0)}</div>
                        <div className="mt-1 text-[13.5px] text-muted">of {formatAmount(cov[side].target, 6, 0)}</div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-5 text-[14px] leading-snug text-ink-2">{placed.decision.action}</p>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* The orchestrated moment: scroll advances the recorded lifecycle. */}
      <Section id="tempo" className="py-24 lg:py-0">
        <LifecycleStory />
      </Section>

      {/* The canonical report: the same object in the app, the analyst and the API. */}
      <Section id="report" className="py-24">
        <Reveal>
          <h2 className="display max-w-[20ch]">One health report, wherever you read it.</h2>
          <p className="prose-body mt-5 max-w-[60ch]">Every block, Korrin turns what it reads from Tempo into one Liquidity Health Report: depth in your range split into your verified orders and everyone else’s, the gap to target, where your funds are, and what is unknown. The app, the analyst and the API all serve that same report, so they can’t disagree.</p>
        </Reveal>
        <Reveal delay={60}>
          <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <TooltipProvider>
              <ReportPanel report={sampleReport} freshness={null} />
            </TooltipProvider>
            <div className="grid content-start gap-5">
              {[
                { t: 'In the app', b: 'Market health sits under the corridor, with exceptions, an incident timeline and what-if analysis that never touches your saved plan.' },
                { t: 'Ask the analyst', b: 'Korrin Analyst explains a shortfall, a change or a hold from the report alone. Every number is checked against the report, and it can’t sign or trade.' },
                { t: 'Over the API and MCP', b: 'Agents read previews for free and the full report over HTTP or MCP. Paid access uses Tempo’s Machine Payments Protocol on testnet.' },
              ].map((c) => (
                <div key={c.t} className="card p-6">
                  <h3 className="title">{c.t}</h3>
                  <p className="mt-2 text-[14.5px] leading-snug text-ink-2">{c.b}</p>
                </div>
              ))}
              <ButtonLink href="/developers" className="justify-self-start">
                See the API
              </ButtonLink>
            </div>
          </div>
          <p className="mt-4 text-[13px] text-muted">The report shown is built from the recorded AlphaUSD session at block {Number(sampleReport.window.block).toLocaleString('en-US')}.</p>
        </Reveal>
      </Section>

      {/* Controls and evidence side by side, compact. */}
      <Section id="controls" className="py-24">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Reveal>
            <h2 className="display max-w-[14ch]">Stop, cancel and withdraw are separate.</h2>
            <p className="prose-body mt-5 max-w-[46ch]">Most tools blur them. Korrin keeps them apart and tells you where your funds are after each one.</p>
            <ul className="mt-10 space-y-6">
              {[
                { icon: <Pause className="size-5" />, t: 'Pause', b: 'Stops new orders. Resting ones stay on the book and can still fill.' },
                { icon: <Ban className="size-5" />, t: 'Cancel', b: 'A signed cancel per order, confirmed when the DEX says it no longer exists. Funds go to your DEX balance.' },
                { icon: <Undo2 className="size-5" />, t: 'Withdraw', b: 'A separate call that moves the DEX balance back to your wallet.' },
              ].map((c) => (
                <li key={c.t} className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-recessed text-ink-2">{c.icon}</span>
                  <span>
                    <span className="block text-[17px] font-medium text-ink">{c.t}</span>
                    <span className="mt-1 block text-[15px] leading-snug text-ink-2">{c.b}</span>
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-4 text-[14px]">
              {[
                ['DEX', <a key="dex" className="tabular hover:text-accent" href={explorerAddress(DEX_ADDRESS)} target="_blank" rel="noreferrer">{shortHex(DEX_ADDRESS, 6, 4)}</a>],
                ['Network', 'Moderato, chain 42431'],
                ['Tokens', 'TIP-20 USD, 6 decimals'],
                ['Price grid', '1 bp steps, 100 minimum'],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="mt-0.5 text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal delay={60}>
            <div id="evidence" className="card scroll-mt-24 overflow-hidden">
              <div className="px-6 pt-6 pb-4">
                <h2 className="heading text-structural">What’s verified, and what isn’t</h2>
                <p className="mt-2 text-[14.5px] text-muted">Every claim links to a run, a test or a file in the repository, or says plainly that it’s unproven.</p>
              </div>
              <ul className="hairline-t divide-y divide-line-faint border-line">
                {CLAIMS.map(([c, e, s]) => (
                  <li key={c} className="flex items-start justify-between gap-4 px-6 py-3.5">
                    <span className="min-w-0">
                      <span className="block text-[14.5px] text-ink">{c}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">{e}</span>
                    </span>
                    <StatusPill tone={s === 'verified' ? 'positive' : s === 'no' ? 'negative' : 'unknown'} icon={s === 'verified' ? undefined : <CircleDashed className="size-3" />} className="mt-0.5 shrink-0">
                      {CLAIM_LABEL[s]}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section className="pt-8 pb-28">
        <Reveal>
          <div className="rounded-[28px] bg-inverse px-6 py-16 text-center md:px-12 md:py-20">
            <h2 className="display mx-auto max-w-[18ch] text-ink-inverse">Set the market you want to make.</h2>
            <p className="mx-auto mt-5 max-w-[50ch] text-[16px] leading-relaxed text-ink-inverse/70">Watch a recorded session with no wallet, or create a testnet signer in your browser and place a real flip order in about a minute.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/app/session" className="inline-flex h-12 items-center rounded-full bg-ink-inverse px-6 text-[15.5px] font-medium text-inverse transition-opacity duration-150 hover:opacity-90">
                Watch a recorded session
              </Link>
              <Link href="/app/mandates/new" className="inline-flex h-12 items-center rounded-full border border-ink-inverse/30 px-6 text-[15.5px] font-medium text-ink-inverse transition-colors duration-150 hover:bg-ink-inverse/10">
                Set up a market
              </Link>
            </div>
          </div>
        </Reveal>
      </Section>

      <footer className="hairline-t border-line">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-12 md:grid-cols-[1.2fr_1fr_1fr] md:px-6">
          <div>
            <KorrinWordmark />
            <p className="mt-3 max-w-[44ch] text-[13.5px] leading-relaxed text-muted">Stablecoin market making on Tempo. Testnet software. Not audited, not for real funds, and not a peg guarantee, deposit product or yield offering.</p>
          </div>
          <div className="text-[14px]">
            <div className="mb-2.5 text-ink">Product</div>
            <ul className="space-y-2 text-muted">
              <li><Link className="hover:text-ink" href="/app">Open the app</Link></li>
              <li><Link className="hover:text-ink" href="/app/session">Recorded session</Link></li>
              <li><Link className="hover:text-ink" href="/app/markets">Order books</Link></li>
            </ul>
          </div>
          <div className="text-[14px]">
            <div className="mb-2.5 text-ink">Source</div>
            <ul className="space-y-2 text-muted">
              <li><a className="hover:text-ink" href={REPO_URL} target="_blank" rel="noreferrer">GitHub repository</a></li>
              <li><a className="hover:text-ink" href={`${REPO_URL}/blob/main/reports/LIVE_RUN.md`} target="_blank" rel="noreferrer">Live run evidence</a></li>
              <li><a className="hover:text-ink" href={`${REPO_URL}/blob/main/reports/HACKATHON_DELTA.md`} target="_blank" rel="noreferrer">Prior work disclosure</a></li>
            </ul>
          </div>
        </div>
        <div className="hairline-t border-line">
          <p className="mx-auto max-w-[1240px] px-4 py-5 text-[13px] text-muted md:px-6">Built fresh in October 2026 for the Colosseum Crypto World’s Fair. Earlier concept work: TempoVault (February 2026). No TempoVault code is reused.</p>
        </div>
      </footer>
    </div>
  )
}

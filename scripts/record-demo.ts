/**
 * Records the product demo (≤ 3 min) from the deployed app with real testnet
 * transactions: replay, order books, market setup, signing, readback, pause,
 * cancel, withdraw. Captions and a visible cursor are injected into the page so
 * the footage explains itself with sound off.
 *
 *   pnpm tsx scripts/record-demo.ts [baseUrl]
 * Output: media/demo/korrin-product-demo.mp4
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Locator, type Page } from 'playwright'

const CLEAN = process.argv.includes('--clean')
const BASE = process.argv.slice(2).find((a) => a.startsWith('http')) ?? 'https://korrin-steel.vercel.app'
const NAME = CLEAN ? 'korrin-clean-footage' : 'korrin-product-demo'
const OUT = join(process.cwd(), 'media', 'demo')
const RAW = join(OUT, 'raw')
const W = 1440
const H = 900

const OVERLAY = `
(() => {
  if (window.__caption) return
  const css = \`
    #k-cursor{position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:999px;background:rgba(17,26,74,.18);border:1.5px solid rgba(17,26,74,.85);pointer-events:none;transition:transform .12s ease}
    #k-cursor.down{transform:scale(.7);background:rgba(30,65,153,.35)}
    #k-caption{position:fixed;z-index:2147483646;left:50%;bottom:28px;transform:translateX(-50%);max-width:880px;padding:12px 20px;border-radius:14px;background:rgba(17,26,74,.92);color:#fff;font:500 17px/1.4 Inter,system-ui,sans-serif;letter-spacing:-.01em;box-shadow:0 18px 40px rgba(0,0,0,.25);opacity:0;transition:opacity .25s ease;pointer-events:none;text-align:center}
    #k-caption.on{opacity:1}
    #k-caption small{display:block;margin-top:2px;font-weight:400;font-size:13px;opacity:.72}
  \`
  const ensure = (id, tag) => {
    let el = document.getElementById(id)
    if (!el && document.body) { el = document.createElement(tag); el.id = id; document.body.appendChild(el) }
    return el
  }
  const setup = () => {
    const st = ensure('k-style', 'style'); if (st && !st.textContent) st.textContent = css
    return { c: ensure('k-cursor', 'div'), cap: ensure('k-caption', 'div') }
  }
  addEventListener('mousemove', (e) => { const { c } = setup(); if (c) { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' } }, true)
  addEventListener('mousedown', () => setup().c?.classList.add('down'), true)
  addEventListener('mouseup', () => setup().c?.classList.remove('down'), true)
  window.__caption = (t, s) => { const { cap } = setup(); if (!cap) return; cap.innerHTML = t + (s ? '<small>' + s + '</small>' : ''); cap.classList.toggle('on', !!t) }
})()
`

let failurePage: Page | null = null

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const caption = async (page: Page, text: string, sub?: string) => {
  if (CLEAN) return
  await page.evaluate(OVERLAY)
  await page.evaluate(([t, s]) => (window as unknown as { __caption: (a: string, b?: string) => void }).__caption(t, s), [text, sub ?? ''] as const)
}

const moveTo = async (page: Page, target: Locator) => {
  const box = await target.boundingBox()
  if (!box) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 })
  await sleep(220)
}

const click = async (page: Page, locator: Locator) => {
  const target = locator.first()
  await target.scrollIntoViewIfNeeded({ timeout: 90_000 })
  await moveTo(page, target)
  await target.click()
}

const scrollBy = async (page: Page, dy: number, steps = 20) => {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps)
    await sleep(28)
  }
}

/** Smoothly scrolls so the target sits near the top of the viewport. */
const scrollTo = async (page: Page, target: Locator) => {
  const box = await target.first().boundingBox()
  if (!box) return
  await scrollBy(page, box.y - 110)
  await sleep(400)
}

const main = async () => {
  rmSync(RAW, { recursive: true, force: true })
  mkdirSync(RAW, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: RAW, size: { width: W, height: H } }, colorScheme: 'light' })
  await ctx.addInitScript(OVERLAY)
  await ctx.addInitScript(() => localStorage.setItem('korrin:theme', 'light'))
  const page = await ctx.newPage()
  failurePage = page
  const t0 = Date.now()
  const mark = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${s}`)

  // 1. Landing
  await page.goto(BASE)
  await page.mouse.move(W / 2, H / 2)
  await sleep(1200)
  await caption(page, 'Korrin puts your stablecoin liquidity on Tempo’s order book, one approved order at a time.', 'Tempo Moderato testnet. Every transaction in this video is real.')
  await sleep(5200)
  mark('landing')

  // 2. Recorded session
  await click(page, page.getByRole('link', { name: 'Watch a recorded session' }))
  await page.getByRole('button', { name: 'Play' }).waitFor()
  await caption(page, 'A real recorded session: one market, one flip order, every step read back from chain.')
  await sleep(2500)
  await click(page, page.getByRole('radio', { name: '4×' }))
  mark('replay-play')
  await click(page, page.getByRole('button', { name: 'Play' }))
  await sleep(4000)
  await caption(page, 'Filled, then flipped. Same order ID, now an ask. Confirmed by reading the order back, not assumed.')
  await sleep(6500)
  await caption(page, 'Paused, cancelled and confirmed gone, then withdrawn. Pausing never pretends to remove liquidity.')
  await sleep(7000)
  mark('replay')

  // 3. Order books
  await click(page, page.getByRole('link', { name: 'Order books' }).first())
  await page.getByRole('row').filter({ hasText: 'BetaUSD' }).first().waitFor({ timeout: 45_000 })
  await caption(page, 'Every pair comes straight from Tempo’s stablecoin DEX. Pick one to preview where liquidity sits.')
  await sleep(2500)
  await click(page, page.getByRole('row').filter({ hasText: 'BetaUSD' }).first())
  await sleep(3500)
  await click(page, page.getByRole('button', { name: 'Open book' }))
  await page.getByText('Liquidity by price level').waitFor({ timeout: 60_000 })
  await caption(page, 'Depth at every price, read from the DEX. Prices the RPC can’t read are marked, never drawn as empty.')
  await sleep(5000)
  mark('market')

  // 4. Set up a market
  await click(page, page.getByRole('link', { name: 'Set up a market here' }))
  await caption(page, 'Set up a market: pick the order book, then choose your price range and sizes.')
  await click(page, page.getByRole('button', { name: 'Continue' }))
  await page.getByText('Place bid', { exact: true }).first().waitFor({ timeout: 60_000 })
  await page.getByText('Depth per level, log scale').first().waitFor({ timeout: 60_000 })
  mark('range-step')
  await caption(page, 'The chart re-plans against the live book as you edit. The dashed outline is the first order Korrin would propose.')
  const slider = page.getByLabel('How far either side')
  await moveTo(page, slider)
  await slider.focus()
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowRight')
    await sleep(350)
  }
  await sleep(2500)
  await click(page, page.getByRole('button', { name: 'Review order', exact: true }))
  await caption(page, 'Review shows your plan and the exact order before anything is signed.')
  await sleep(4500)
  mark('builder')

  // 5. Signer + faucet
  await click(page, page.getByRole('button', { name: 'Create testnet signer' }))
  await caption(page, 'No extension needed: a testnet-only key is created in this browser. Korrin’s server never sees it.')
  await sleep(3500)
  await scrollTo(page, page.getByRole('heading', { name: 'Your first order' }))
  await caption(page, 'The new signer holds nothing, so Korrin won’t propose an order and says exactly why.')
  await sleep(5500)
  await caption(page, 'Fund the signer from Tempo’s testnet faucet.')
  await click(page, page.locator('header button').filter({ hasText: '0x' }).first())
  await click(page, page.getByRole('button', { name: 'Fund from testnet faucet' }))
  await page.getByText('Faucet funds received').waitFor({ timeout: 90_000 })
  await page.getByText('The exact call you’ll sign').waitFor({ timeout: 30_000 })
  await sleep(1200)
  await page.keyboard.press('Escape')
  await scrollTo(page, page.getByRole('heading', { name: 'Your first order' }))
  await caption(page, 'Funds arrived. With real balances, Korrin proposes the first bid.')
  await sleep(6500)
  mark('funded')

  // 6. Save + sign
  await click(page, page.getByRole('button', { name: 'Save and review the order' }))
  await page.getByRole('button', { name: 'Sign and place' }).waitFor({ timeout: 90_000 })
  await caption(page, 'One flip bid, reviewed field by field. You approve it. Korrin never signs for you.')
  await sleep(4500)
  await click(page, page.getByRole('button', { name: 'Sign and place' }))
  mark('signing')
  await caption(page, 'Signing, submitted, included, checking the book, verified. Each stage is real, at Tempo’s speed.')
  await page.getByRole('dialog').getByText('getOrder(').first().waitFor({ timeout: 120_000 }).catch(() => {
    throw new Error('Placement did not reach a confirmed readback; not recording a false success')
  })
  await sleep(4500)
  mark('placed')
  await click(page, page.getByRole('button', { name: 'Done' }))
  await sleep(6000)
  await caption(page, 'Your bid is on the book at its real price. The gap is now on the ask side, and the next step says so.')
  await sleep(5000)
  await scrollTo(page, page.getByRole('heading', { name: 'Orders', exact: true }))
  await caption(page, 'Each order with its DEX ID and live state, and a history that separates what you signed from what Tempo reported.')
  await sleep(4500)
  await scrollTo(page, page.getByRole('heading', { level: 1 }))
  mark('detail')

  // 7. Pause + cancel
  await click(page, page.getByRole('button', { name: 'Pause new orders' }))
  mark('paused')
  await caption(page, 'Pausing stops new orders. The bid is still on the book, and Korrin keeps reading the market.')
  await sleep(4500)
  await scrollTo(page, page.getByRole('heading', { name: 'Orders', exact: true }))
  await click(page, page.getByRole('row').filter({ hasText: 'On the book' }).getByRole('button', { name: 'Cancel' }))
  await caption(page, 'Cancel is its own signed transaction. It counts only once the DEX says the order no longer exists.')
  await sleep(2500)
  await click(page, page.getByRole('button', { name: 'Sign and cancel' }))
  await page.getByRole('dialog').getByText('OrderDoesNotExist').first().waitFor({ timeout: 120_000 }).catch(() => {
    throw new Error('Cancel was not verified by readback; not recording a false success')
  })
  await sleep(4000)
  await click(page, page.getByRole('button', { name: 'Done' }))
  mark('cancelled')

  // 8. Withdraw
  await click(page, page.getByRole('link', { name: 'Controls' }))
  mark('controls')
  await caption(page, 'The funds went to the DEX balance, not your wallet. Withdrawing is its own step.')
  const withdraw = page.getByRole('listitem').filter({ hasText: 'PathUSD' }).getByRole('button', { name: 'Withdraw' })
  await withdraw.first().waitFor({ timeout: 45_000 })
  await sleep(3000)
  for (let attempt = 1; ; attempt++) {
    await click(page, withdraw)
    await click(page, page.getByRole('button', { name: 'Sign and withdraw' }))
    await page.getByRole('dialog').getByText(/Withdraw included|Failed/).first().waitFor({ timeout: 120_000 })
    const ok = (await page.getByRole('dialog').innerText()).includes('Withdraw included')
    await sleep(2500)
    await click(page, page.getByRole('button', { name: 'Done' }))
    if (ok) break
    if (attempt >= 2) throw new Error('Withdraw did not confirm; not recording a false success')
    await sleep(3000)
  }
  mark('withdrawn')

  // 9. Activity + close
  await click(page, page.getByRole('link', { name: 'Activity' }))
  await caption(page, 'One ledger, newest first. Every entry says whether Tempo reported it, you signed it, or it came from the recording.')
  await sleep(6000)
  await caption(page, 'Korrin. Set the market you want to make.', 'korrin-steel.vercel.app · Testnet only · Not audited')
  await sleep(4500)
  mark('end')

  const video = page.video()
  await ctx.close()
  await browser.close()
  const raw = video ? await video.path() : join(RAW, readdirSync(RAW)[0])
  const webm = join(OUT, `${NAME}.webm`)
  renameSync(raw, webm)
  execFileSync('ffmpeg', ['-y', '-ss', '1', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, `${NAME}.mp4`)], { stdio: 'ignore' })
  console.log('wrote', join(OUT, `${NAME}.mp4`))
}

main().catch(async (e) => {
  await failurePage?.screenshot({ path: join(OUT, 'failure.png') }).catch(() => undefined)
  console.error(e)
  process.exit(1)
})

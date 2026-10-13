/**
 * End-to-end through the real UI against Tempo Moderato:
 * testnet signer → faucet → mandate builder → sign first proposal → readback →
 * cancel → readback. Every transaction is real. Screenshots and the browser
 * storage state are written for review.
 *
 *   SHOT_BASE=http://localhost:3100 pnpm tsx scripts/e2e-live.ts [--keep]
 */
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from 'playwright'

const base = process.env.SHOT_BASE ?? 'http://localhost:3100'
const out = process.env.SHOT_DIR ?? '/private/tmp/claude-501/-Users-mac-korrin/38fb4e15-685f-435b-9bf0-3c001f93d3e8/scratchpad/e2e'
const keep = process.argv.includes('--keep')
const BETA = '0x20c0000000000000000000000000000000000002'

const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
  console.log('shot', name)
}

const main = async () => {
  mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)))
  const t0 = Date.now()
  const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

  await page.goto(`${base}/app/mandates/new?base=${BETA}`)
  await page.getByRole('button', { name: 'Continue' }).click({ timeout: 60_000 })
  log('step 2')
  await page.getByText('Place bid', { exact: true }).first().waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  log('step 3')
  await page.getByRole('button', { name: 'Create testnet signer' }).click()
  log('signer created')

  await page.locator('header button:has(svg)').filter({ hasText: '0x' }).first().click()
  await page.getByRole('button', { name: 'Fund from testnet faucet' }).click()
  await page.getByText('Faucet funds received').waitFor({ timeout: 90_000 })
  log('faucet funded')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(12_000)
  await shot(page, '01-review')

  await page.getByRole('button', { name: 'Create mandate' }).click()
  log('mandate created')
  await page.getByRole('button', { name: 'Sign and place' }).waitFor({ timeout: 90_000 })
  await shot(page, '02-execution-review')
  await page.getByRole('button', { name: 'Sign and place' }).click()
  log('signing')
  await page.getByRole('button', { name: 'Done' }).waitFor({ timeout: 120_000 })
  log(`finished: ${(await page.getByRole('dialog').innerText()).split('\n').filter((l) => /getOrder|Unresolved|Failed|reverts/.test(l)).join(' | ')}`)
  await shot(page, '03-confirmed')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForTimeout(15_000)
  await shot(page, '04-mandate-active')

  if (!keep) {
    await page.getByRole('row').filter({ hasText: 'Resting, verified' }).getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Sign and cancel' }).click()
    await page.getByRole('button', { name: 'Done' }).waitFor({ timeout: 120_000 })
    log(`cancel finished: ${(await page.getByRole('dialog').innerText()).split('\n').filter((l) => /getOrder|Unresolved|Failed|reverts/.test(l)).join(' | ')}`)
    await shot(page, '05-cancel-confirmed')
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForTimeout(12_000)
    await shot(page, '06-after-cancel')
  }
  await context.storageState({ path: `${out}/storage-state.json` })
  log(`url ${page.url()}`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

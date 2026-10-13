/**
 * Captures the README screenshots of the market screen from a browser state that
 * owns a real testnet market (see scripts/e2e-live.ts --keep).
 *   pnpm tsx scripts/capture-screens.ts <market-path> <storage-state.json>
 */
import { chromium } from 'playwright'

const [path, state] = process.argv.slice(2)
const base = process.env.SHOT_BASE ?? 'http://localhost:3100'
const out = 'public/screens'

const main = async () => {
  const browser = await chromium.launch()
  for (const theme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme, storageState: state })
    await ctx.addInitScript((t) => localStorage.setItem('korrin:theme', t), theme)
    const page = await ctx.newPage()
    await page.goto(`${base}${path}`)
    await page.getByText('On the book', { exact: true }).first().waitFor({ timeout: 60_000 })
    await page.waitForTimeout(6_000)
    await page.screenshot({ path: `${out}/market-${theme}.png`, type: 'png' })
    console.log('captured', theme)
    await ctx.close()
  }
  await browser.close()
}
main()

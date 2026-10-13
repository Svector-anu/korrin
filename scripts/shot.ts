/**
 * Screenshot QA: pnpm tsx scripts/shot.ts <path> [--theme light|dark|both] [--widths 1440,390] [--wait ms] [--full] [--storage state.json]
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const path = args[0] ?? '/'
const opt = (name: string, fallback: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback)
const themes = opt('theme', 'both') === 'both' ? ['light', 'dark'] : [opt('theme', 'light')]
const widths = opt('widths', '1440').split(',').map(Number)
const wait = Number(opt('wait', '4000'))
const full = args.includes('--full')
const clicks = args.includes('--click') ? opt('click', '').split('|') : []
const suffix = opt('name', '')
const storageState = args.includes('--storage') ? opt('storage', '') : undefined
const base = process.env.SHOT_BASE ?? 'http://localhost:3100'
const outDir = process.env.SHOT_DIR ?? '/private/tmp/claude-501/-Users-mac-korrin/38fb4e15-685f-435b-9bf0-3c001f93d3e8/scratchpad/shots'

const main = async () => {
  mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch()
  for (const theme of themes) {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, colorScheme: theme as 'light' | 'dark', storageState })
      await context.addInitScript((t) => localStorage.setItem('korrin:theme', t), theme)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' }).catch(() => undefined)
      await page.waitForTimeout(wait)
      for (const c of clicks) {
        await page.getByText(c, { exact: true }).filter({ visible: true }).first().click().catch((e) => errors.push(`click ${c}: ${e.message.split('\n')[0]}`))
        await page.waitForTimeout(wait)
      }
      if (full) {
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 500) {
            window.scrollTo(0, y)
            await new Promise((r) => setTimeout(r, 120))
          }
          window.scrollTo(0, 0)
        })
        await page.waitForTimeout(800)
      }
      const file = `${outDir}/${path.replace(/[^a-z0-9]+/gi, '_') || 'root'}${suffix ? `-${suffix}` : ''}-${theme}-${width}.png`
      await page.screenshot({ path: file, fullPage: full })
      console.log(file, errors.length ? `ERRORS: ${errors.slice(0, 4).join(' | ')}` : '')
      await context.close()
    }
  }
  await browser.close()
}
main()

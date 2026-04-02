import { chromium } from 'playwright'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'

const agentDir = join(import.meta.dir, '..', '.agent')
mkdirSync(agentDir, { recursive: true })

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
})

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

await page.goto('file://' + join(import.meta.dir, 'pure', 'index.html'), {
  waitUntil: 'domcontentloaded',
  timeout: 10000,
})
await page.waitForTimeout(500)
await page.screenshot({ path: join(agentDir, 'with-inval.png') })
console.log('Saved: .agent/with-inval.png')

await page.goto('file://' + join(import.meta.dir, 'without-inval', 'index.html'), {
  waitUntil: 'domcontentloaded',
  timeout: 10000,
})
await page.waitForTimeout(500)
await page.screenshot({ path: join(agentDir, 'without-inval.png') })
console.log('Saved: .agent/without-inval.png')

await browser.close()
console.log('Done.')

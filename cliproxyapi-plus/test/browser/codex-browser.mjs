import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/liuming.liu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs')
const executablePath = process.env.CHROMIUM_EXECUTABLE || '/Users/liuming.liu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const output = process.env.DSH_TEST_OUTPUT || '/tmp/cliproxy-codex-browser'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
await page.clock.install()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const fixture = pathToFileURL(resolve('test/browser/harness.html'))
fixture.search = '?codex=1'
try {
  await page.goto(fixture.href)
  await page.waitForFunction(() => window.__testHarnessReady)
  await page.getByRole('button', { name: 'Credentials', exact: true }).click()
  const card = page.locator('.cpa-auth-card').filter({ hasText: 'codex@example.com' })
  await card.getByText('Pro 200', { exact: true }).waitFor()
  const weekly = card.getByRole('region', { name: 'Weekly limit', exact: true })
  const fiveHour = card.getByRole('region', { name: '5-hour limit', exact: true })
  assert.match(await card.locator('.cpa-codex-summary').innerText(), /Credits balance 0/)
  assert.match(await card.locator('.cpa-codex-summary').innerText(), /Available resets 2/)
  assert.match(await card.locator('.cpa-codex-summary').innerText(), /Renews/)
  assert.match(await weekly.innerText(), /44%/)
  assert.match(await fiveHour.innerText(), /90%/)
  await card.locator('.cpa-codex-resets summary').click()
  assert.equal(await card.locator('.cpa-codex-resets li').count(), 2)
  await card.getByRole('button', { name: 'Refresh quota', exact: true }).click()
  await weekly.getByText('40%', { exact: true }).waitFor()
  await page.clock.runFor(8100)
  assert.match(await weekly.innerText(), /40%/)
  console.log('PASS Codex live quota, swapped window durations, zero Credits, renewal, reset expiries and fresh refresh')
  await page.screenshot({ path: `${output}/codex-credentials.png`, fullPage: true })

  const authenticate = page.getByRole('button', { name: 'Authenticate', exact: true })
  assert.equal(await authenticate.isDisabled(), true)
  await page.evaluate(() => window.__testSetClientAuthentication('codex', 'expired'))
  await page.clock.runFor(8100)
  await authenticate.click()
  assert.deepEqual(await page.evaluate(() => window.__testAuthCommands), ['node server.mjs --config config.yaml --codex-login'])
  await page.locator('.cpa-auth-flow').getByText('Codex · 1/1', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Stop authentication', exact: true }).click()
  await authenticate.waitFor()
  await page.evaluate(() => {
    window.__testSetClientAuthentication('qoder', 'missing')
    window.__testSetClientAuthentication('codex', 'expired')
  })
  await page.clock.runFor(8100)
  await authenticate.click()
  assert.deepEqual(await page.evaluate(() => window.__testAuthCommands), [
    'node server.mjs --config config.yaml --qoder-login', 'node server.mjs --config config.yaml --codex-login',
  ])
  await page.locator('.cpa-auth-flow').getByText('Qoder · 1/2', { exact: true }).waitFor()
  await page.evaluate(() => window.__testCompleteAuthentication())
  await page.clock.runFor(1100)
  await page.locator('.cpa-auth-flow').getByText('Codex · 2/2', { exact: true }).waitFor()
  await page.evaluate(() => window.__testCompleteAuthentication())
  await page.clock.runFor(1100)
  assert.equal(await authenticate.isDisabled(), true)
  console.log('PASS valid clients are skipped, missing/expired clients queue separately and progress advances through both clients')

  await page.evaluate(() => {
    window.__testRemote.refreshCredentialQuota = async request => ({ ok: true, value: {
      name: request.name, observedAt: Date.now(), usage: { kind: 'codex', plan: 'plus', creditBalance: null, resetCount: 0, resets: [], windows: [], partial: true },
    } })
  })
  await card.getByRole('button', { name: 'Refresh quota', exact: true }).click()
  await card.getByText('Plus', { exact: true }).waitFor()
  await card.getByText('No usage windows available', { exact: true }).waitFor()
  assert.match(await card.locator('.cpa-codex-summary').innerText(), /Available resets 0/)
  await page.setViewportSize({ width: 540, height: 900 })
  assert.equal(await page.locator('.cpa-root').evaluate(element => element.scrollWidth <= element.clientWidth), true)
  await page.screenshot({ path: `${output}/codex-narrow.png`, fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS partial quota remains readable, unknown balance differs from zero, and narrow layout has no overflow')
} finally {
  await browser.close()
}

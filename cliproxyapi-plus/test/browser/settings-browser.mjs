import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/liuming.liu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs')
const executablePath = process.env.CHROMIUM_EXECUTABLE || '/Users/liuming.liu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const output = process.env.DSH_TEST_OUTPUT || '/tmp/cliproxy-settings-browser'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
await page.clock.install()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const fixture = pathToFileURL(resolve('test/browser/harness.html'))
fixture.search = '?emptySettings=1&locale=en'
const fields = {
  path: page.getByRole('textbox', { name: 'Configuration path', exact: true }),
  start: page.getByRole('textbox', { name: 'Start command', exact: true }),
  qoder: page.getByRole('checkbox', { name: 'Qoder', exact: true }),
  codex: page.getByRole('checkbox', { name: 'Codex', exact: true }),
}
async function openConfiguration() {
  await page.getByRole('button', { name: 'Configuration', exact: true }).click()
  await fields.path.waitFor()
}
async function saveSettings() {
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await page.locator('.cpa-settings-feedback').getByText('Runtime settings saved.', { exact: true }).waitFor()
  assert.equal(await page.locator('.cpa-notice--success').count(), 0)
}
async function reload() {
  await page.reload()
  await page.waitForFunction(() => window.__testHarnessReady)
  await openConfiguration()
}
try {
  await page.goto(fixture.href)
  await page.waitForFunction(() => window.__testHarnessReady)
  assert.equal(await page.getByRole('button', { name: 'Start server', exact: true }).isDisabled(), true)
  await openConfiguration()
  assert.equal(await fields.path.inputValue(), '')
  assert.equal(await fields.start.inputValue(), '')
  assert.equal(await fields.qoder.isChecked(), false)
  assert.equal(await fields.codex.isChecked(), false)
  assert.equal(await fields.path.getAttribute('placeholder'), 'Absolute path to your proxy configuration file')
  assert.equal(await fields.start.getAttribute('placeholder'), 'Command to start the CLIProxyAPIPlus proxy')
  const singleLineHeight = (await fields.path.boundingBox()).height
  assert.ok((await fields.start.boundingBox()).height <= singleLineHeight + 1, 'Empty command uses a single-line input height')
  const preview = page.locator('.cpa-command-preview')
  assert.equal(await preview.getAttribute('open'), null)
  await preview.locator('summary').click()
  await preview.getByText('Select clients to preview their authentication commands.', { exact: true }).waitFor()
  await fields.qoder.check()
  await preview.getByText('Enter a start command to generate authentication commands.', { exact: true }).waitFor()
  await fields.qoder.uncheck()
  assert.equal(await page.getByRole('button', { name: 'Save settings', exact: true }).isDisabled(), true)
  await page.getByText('Enter and save the proxy configuration path to view and edit YAML.', { exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.__testReadConfigCalls), [])
  assert.equal(await page.getByRole('alert').count(), 0)
  const configPath = '/tmp/my proxy/config.yaml'
  await fields.path.fill(configPath)
  await page.clock.runFor(8100)
  assert.equal(await fields.path.inputValue(), configPath)
  await saveSettings()
  await page.locator('.cm-content').waitFor()
  await reload()
  assert.equal(await fields.path.inputValue(), configPath)
  assert.equal(await fields.start.inputValue(), '')
  assert.equal(await fields.qoder.isChecked(), false)
  console.log('PASS empty defaults, English placeholders, partial setup, draft preservation and YAML activation')

  const command = 'proxy ' + Array.from({ length: 18 }, (_, index) => `--option-${index} value-${index}`).join(' ')
  const startingHeight = (await fields.start.boundingBox()).height
  await fields.start.fill(command)
  await fields.qoder.check()
  await fields.codex.check()
  await preview.locator('summary').click()
  await preview.getByText('Preview of unsaved settings. Save to apply.', { exact: true }).waitFor()
  const wideHeight = (await fields.start.boundingBox()).height
  assert.ok(wideHeight > startingHeight)
  const pathBox = await fields.path.boundingBox()
  const startBox = await fields.start.boundingBox()
  const clientsBox = await page.getByRole('group', { name: 'Authentication CLI clients', exact: true }).boundingBox()
  assert.equal(startBox.width, pathBox.width)
  assert.ok(clientsBox.y >= startBox.y + startBox.height)
  assert.ok((await page.locator('.cpa-client-choices label').first().boundingBox()).height < 35)
  assert.deepEqual(await preview.locator('code').allTextContents(), [`${command} --qoder-login`, `${command} --codex-login`])
  await preview.getByText('Authenticated, will skip', { exact: true }).waitFor()
  await preview.getByText('Needs authentication', { exact: true }).waitFor()
  await page.locator('.cpa-settings-feedback').getByText('Unsaved changes', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.__testAuthCommands), undefined)
  await page.setViewportSize({ width: 540, height: 1000 })
  await page.waitForFunction(height => document.querySelector('.cpa-start-command').getBoundingClientRect().height > height, wideHeight)
  assert.equal(await fields.start.evaluate(element => element.scrollHeight <= element.clientHeight + 1), true)
  assert.equal(await page.locator('.cpa-root').evaluate(element => element.scrollWidth <= element.clientWidth), true)
  await fields.start.fill('proxy')
  await page.waitForFunction(height => document.querySelector('.cpa-start-command').getBoundingClientRect().height < height, wideHeight)
  assert.ok((await fields.start.boundingBox()).height <= singleLineHeight + 1, 'Shortening the command restores single-line height')
  await fields.path.fill('/tmp/another-config.yaml')
  assert.equal(await preview.getByText('Status not yet confirmed', { exact: true }).count(), 2)
  await fields.path.fill(configPath)
  await page.setViewportSize({ width: 1200, height: 1000 })
  console.log('PASS full-width auto-growing command field, compact clients and draft previews with per-client eligibility')

  await page.evaluate(() => {
    window.__originalUpdateSettings = window.__testRemote.updateSettings
    window.__testRemote.updateSettings = async () => { throw new Error('Settings temporarily unavailable') }
  })
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await page.locator('.cpa-settings-feedback').getByText('Settings temporarily unavailable', { exact: true }).waitFor()
  assert.equal(await page.locator('.cpa-notice--error').count(), 0)
  assert.equal(await fields.start.inputValue(), 'proxy')
  await page.evaluate(() => {
    window.__testRemote.updateSettings = request => new Promise(resolve => {
      window.__testFinishSettings = async () => resolve(await window.__originalUpdateSettings(request))
    })
  })
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await page.getByRole('button', { name: 'Saving…', exact: true }).waitFor()
  for (const field of Object.values(fields)) assert.equal(await field.isDisabled(), true)
  await page.evaluate(() => window.__testFinishSettings())
  await page.locator('.cpa-settings-feedback').getByText('Runtime settings saved.', { exact: true }).waitFor()
  await page.evaluate(() => { window.__testRemote.updateSettings = window.__originalUpdateSettings })
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  assert.equal(await page.getByText('Runtime settings saved.', { exact: true }).count(), 0)
  await openConfiguration()
  await page.locator('.cpa-settings-feedback').getByText('Runtime settings saved.', { exact: true }).waitFor()
  await page.clock.runFor(30100)
  assert.equal(await page.locator('.cpa-settings-feedback').innerText(), '')
  console.log('PASS contextual save feedback, failure retry, in-flight input protection, tab scoping and 30-second expiry')

  await fields.start.fill('node /tmp/my-cli.mjs --serve')
  await saveSettings()
  await reload()
  assert.equal(await fields.path.inputValue(), configPath)
  assert.equal(await fields.start.inputValue(), 'node /tmp/my-cli.mjs --serve')
  assert.equal(await fields.qoder.isChecked(), true)
  assert.equal(await fields.codex.isChecked(), true)
  await fields.qoder.uncheck()
  await saveSettings()
  await reload()
  assert.equal(await fields.path.inputValue(), configPath)
  assert.equal(await fields.start.inputValue(), 'node /tmp/my-cli.mjs --serve')
  assert.equal(await fields.qoder.isChecked(), false)
  assert.equal(await fields.codex.isChecked(), true)
  await fields.path.fill('')
  await saveSettings()
  await reload()
  assert.equal(await fields.path.inputValue(), '')
  assert.equal(await fields.start.inputValue(), 'node /tmp/my-cli.mjs --serve')
  await fields.start.fill('')
  await fields.codex.uncheck()
  await saveSettings()
  await reload()
  assert.equal(await fields.start.inputValue(), '')
  assert.equal(await fields.qoder.isChecked(), false)
  assert.equal(await fields.codex.isChecked(), false)
  console.log('PASS saved settings restore after page restart, stay editable, and preserve explicitly cleared fields')

  const chinese = await browser.newPage()
  chinese.on('pageerror', error => errors.push(error.message))
  fixture.search = '?emptySettings=1&locale=zh'
  await chinese.goto(fixture.href)
  await chinese.locator('.cpa-header').waitFor()
  assert.equal(await chinese.locator('.cpa-brand p').innerText(), 'CLI Proxy API 代理控制台 -- 本插件开源地址, 感谢开源项目 CLIProxyAPIPlus')
  assert.equal(await chinese.getByRole('link', { name: '本插件开源地址', exact: true }).getAttribute('href'), 'https://github.com/liuming-dev/dsh-plugins/tree/main/cliproxyapi-plus')
  await chinese.getByRole('button', { name: '配置', exact: true }).click()
  for (const [label, placeholder] of [
    ['配置文件路径', '您的代理配置文件，绝对路径'],
    ['启动命令', '启动 CLIProxyAPIPlus 代理的命令'],
  ]) {
    const input = chinese.getByRole('textbox', { name: label, exact: true })
    assert.equal(await input.inputValue(), '')
    assert.equal(await input.getAttribute('placeholder'), placeholder)
  }
  await chinese.getByRole('group', { name: '认证 CLI 客户端', exact: true }).waitFor()
  assert.equal(await chinese.getByRole('checkbox', { name: 'Qoder', exact: true }).isChecked(), false)
  assert.equal(await chinese.getByRole('checkbox', { name: 'Codex', exact: true }).isChecked(), false)
  await chinese.getByRole('textbox', { name: '配置文件路径', exact: true }).fill('/tmp/CLIProxyAPIPlus/config.yaml')
  await chinese.getByRole('textbox', { name: '启动命令', exact: true }).fill('go run /Users/example/My/codespace/github/CLIProxyAPIPlus/cmd/server --config /Users/example/My/codespace/github/CLIProxyAPIPlus/config.yaml')
  await chinese.getByRole('checkbox', { name: 'Qoder', exact: true }).check()
  await chinese.getByRole('checkbox', { name: 'Codex', exact: true }).check()
  await chinese.getByRole('button', { name: '保存设置', exact: true }).click()
  await chinese.locator('.cpa-settings-feedback').getByText('运行设置已保存。', { exact: true }).waitFor()
  await chinese.screenshot({ path: `${output}/settings-zh-light.png`, fullPage: true })
  await chinese.getByText('查看生成的认证命令', { exact: true }).click()
  await chinese.getByText('已认证，将跳过', { exact: true }).waitFor()
  await chinese.locator('.cpa-command-preview').getByText('待认证', { exact: true }).waitFor()
  await chinese.screenshot({ path: `${output}/settings-preview-zh.png`, fullPage: true })
  await chinese.setViewportSize({ width: 540, height: 1000 })
  await chinese.evaluate(() => {
    const style = document.documentElement.style
    for (const [name, value] of Object.entries({
      '--dsw-alias-bg-base': '#202023', '--dsw-alias-bg-layer-1': '#252529', '--dsw-alias-bg-layer-2': '#303035',
      '--dsw-alias-label-primary': '#ececef', '--dsw-alias-label-secondary': '#a3a3af',
      '--dsw-alias-border-l1': '#36363b', '--dsw-alias-border-l2': '#48484f',
    })) style.setProperty(name, value)
    style.colorScheme = 'dark'
  })
  assert.equal(await chinese.locator('.cpa-root').evaluate(element => element.scrollWidth <= element.clientWidth), true)
  assert.equal(await chinese.locator('.cpa-command-preview__list').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(37, 37, 41)')
  await chinese.screenshot({ path: `${output}/settings-preview-dark-narrow.png`, fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS Chinese labels and preview states, dark/narrow form layout, theme inheritance and no browser runtime errors')
} finally {
  await browser.close()
}

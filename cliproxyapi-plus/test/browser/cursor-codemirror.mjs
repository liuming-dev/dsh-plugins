import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/liuming.liu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs')
const executablePath = process.env.CHROMIUM_EXECUTABLE || '/Users/liuming.liu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: Number(process.env.TEST_DPR || 2) })
const failures = []

async function documentPosition() {
  return page.evaluate(() => {
    const selection = window.getSelection()
    if (!selection.anchorNode) throw new Error('No selection')
    const node = selection.anchorNode, offset = selection.anchorOffset
    const lines = [...document.querySelectorAll('.cm-content .cm-line')]
    let position = 0
    for (const line of lines) {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
      let current
      while ((current = walker.nextNode())) {
        if (current === node) return position + offset
        position += current.nodeValue.length
      }
      position += 1
    }
    throw new Error('Selection is outside the YAML document')
  })
}

try {
  await page.goto(pathToFileURL(resolve('test/browser/harness.html')).href)
  await page.waitForFunction(() => window.__testHarnessReady || window.__testHarnessError)
  assert.equal(await page.evaluate(() => window.__testHarnessError), undefined)
  await page.getByRole('button', { name: 'Configuration', exact: true }).click()
  await page.locator('.cm-editor .cm-content').waitFor()
  const targets = await page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const value = content.innerText
    return ['host', '127.0.0.1', '8317', 'sk-local', 'secret-key', '中文注释'].map(needle => ({ needle, index: value.indexOf(needle) + Math.min(2, needle.length - 1) }))
  })
  for (const target of targets) {
    const point = await page.evaluate(index => {
      const lines = [...document.querySelectorAll('.cm-content .cm-line')]
      let remaining = index
      for (const line of lines) {
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
        let node
        while ((node = walker.nextNode())) {
          if (remaining <= node.nodeValue.length) {
            const range = document.createRange()
            range.setStart(node, remaining)
            range.setEnd(node, Math.min(remaining + 1, node.nodeValue.length))
            const rect = range.getBoundingClientRect()
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
          }
          remaining -= node.nodeValue.length
        }
        remaining -= 1
      }
      throw new Error(`Cannot map character ${index}`)
    }, target.index)
    await page.mouse.click(point.x, point.y)
    const actual = await documentPosition()
    const result = { ...target, actual, tolerance: 1 }
    console.log(JSON.stringify(result))
    if (Math.abs(actual - target.index) > 1) failures.push(result)
  }
  const beforeTab = await page.locator('.cm-content').innerText()
  await page.keyboard.press('Tab')
  const afterTab = await page.locator('.cm-content').innerText()
  assert.equal(afterTab.length, beforeTab.length + 2)
  assert.ok(await page.getByRole('button', { name: 'Save YAML', exact: true }).isEnabled())
  console.log('PASS: Tab inserts two spaces and preserves the normal save workflow')
  const typography = await page.locator('.cm-scroller').evaluate(element => {
    const style = getComputedStyle(element)
    return { fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight }
  })
  console.log('Typography:', JSON.stringify(typography))
  assert.equal(failures.length, 0, `CodeMirror cursor drift: ${JSON.stringify(failures)}`)
  console.log('PASS: CodeMirror keeps every tested click within one character of the target')
} finally {
  await browser.close()
}

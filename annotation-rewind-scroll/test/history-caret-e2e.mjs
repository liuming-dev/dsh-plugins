/** Production history module + Harness composer runtime + real Chromium keys; no live sessions or model calls. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const harnessRoot = process.env.DSH_HARNESS_ROOT || '/Users/liuming.liu/My/codespace/github/deepseek-harness'
const require = createRequire(join(harnessRoot, 'package.json'))
const { buildSync } = createRequire(require.resolve('tsx/package.json'))('esbuild')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/liuming.liu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs')
const output = process.env.DSH_CARET_OUTPUT || '/tmp/dsh-history-caret'
mkdirSync(output, { recursive: true })
const source = readFileSync(new URL('../client.history.js', import.meta.url), 'utf8')
const editorPath = join(harnessRoot, 'packages/client/ui-conversation/src/client/input/editor')
const bundle = buildSync({
  stdin: { resolveDir: editorPath, contents: `
    import { DraftEditorRuntime } from './runtime.ts';
    import { registerComposerKeymap } from './keymap.ts';
    import { $selectDetectSpan } from './span-map.ts';
    import { $getRoot, $createLineBreakNode } from 'lexical';
    let runtime, revision = 0, signature = '', sequence = 0;
    const composer = document.querySelector('[data-composer-input]');
    runtime = new DraftEditorRuntime({
      onUpdate() {
        runtime.refreshProjection();
        const next = JSON.stringify([runtime.projection.clipboardText, runtime.projection.occurrences]);
        if (next !== signature) { signature = next; revision++; }
      }, openReference: () => false, lexicon: () => new Map(), resolveLexicon: () => undefined,
    });
    runtime.register(); runtime.editor.setRootElement(composer);
    registerComposerKeymap(runtime.editor, {
      arbitrate: () => 'pass', space: () => false, dismissPopup() {}, canSubmit: () => false,
      submit() { throw Error('Unexpected submission'); }, intakeFiles() {}, pasteText: text => runtime.paste(text),
    });
    const input = {
      get draftSnapshot() { return { text: runtime.projection.clipboardText, references: runtime.projection.occurrences.map(({ occurrenceId, ...ref }) => ref) }; },
      state: { getSnapshot: () => ({ draft: runtime.projection.clipboardText, draftRev: revision, phase: 'plain', occurrences: runtime.projection.occurrences }) },
      setDraft(value) {
        const draft = typeof value === 'string' ? { text: value, references: [] } : value;
        if (draft.references.length) runtime.restoreDraft(draft.text, draft.references);
        else runtime.setDraft(draft.text);
      }, notify() { throw Error('Unexpected history error'); },
    };
    const entries = [1, 2].map(seq => ({ event: { type: 'user/message', seq, data: { id: 'u' + seq, source: { kind: 'user' }, content: [{ type: 'text', text: 'history ' + seq + '\\nsecond line' }] } } }));
    const session = { eventSource: { getSnapshot: () => ({ entries }), subscribe: () => () => {} }, async loadThrough() { if (fixture.pending) await fixture.pending; } };
    const ctx = {
      remote: { $mount: async () => () => {} },
      get: () => ({ async listMessages() { fixture.requests++; return { ok: true, value: { ok: true, items: entries.map(({ event }) => ({ messageId: event.data.id, seq: event.seq, turn: event.seq })) } }; } }),
      sessions: { binding: () => ({ session }), scope: id => id }, conversation: { input: { for: () => input } },
    };
    const fixture = window.fixture = {
      requests: 0, input, runtime,
      async install() { this.history = await window.historyFactory().installHistory(ctx, { repaint() {}, sessionId: () => 'case-' + sequence, isEditing: () => false }); },
      reset(value) { this.history?.setSession('case-' + ++sequence); composer.focus(); input.setDraft(value); this.requests = 0; },
      select(start, end = start) { runtime.editor.update(() => { $selectDetectSpan({ start, end }); }, { discrete: true }); },
      snapshot() { return { ...input.draftSnapshot, caret: runtime.projection.caret, selection: runtime.projection.selection, requests: this.requests }; },
      linebreak() { runtime.editor.update(() => { const p = $getRoot().getFirstChild(); p.append($createLineBreakNode()); p.selectEnd(); }, { discrete: true }); },
      gate() { this.pending = new Promise(resolve => { this.release = () => { this.pending = null; resolve(); }; }); },
    };
    window.__ModuleLoader__ = { load: registration => { window.historyFactory = registration.factory; } };
    document.addEventListener('keydown', event => { queueMicrotask(() => { fixture.lastKey = { key: event.key, prevented: event.defaultPrevented, repeat: event.repeat }; }); });
  ` },
  bundle: true, write: false, outfile: 'editor.js', format: 'iife', platform: 'browser', jsx: 'automatic',
  loader: { '.css': 'empty', '.module.css': 'empty' }, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
}).outputFiles[0].text
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || '/Users/liuming.liu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
const checks = [], errors = []
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); console.log('PASS', name) }
page.on('pageerror', error => errors.push(error.message))
const snapshot = () => page.evaluate(() => fixture.snapshot())
const reset = value => page.evaluate(value => fixture.reset(value), value)
const select = (start, end = start) => page.evaluate(([start, end]) => fixture.select(start, end), [start, end])
const press = async key => { await page.keyboard.press(key); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))) }
await page.route('http://caret.test/**', route => {
  const path = new URL(route.request().url()).pathname
  return route.fulfill(path === '/history.js' ? { contentType: 'application/javascript; charset=utf-8', body: source }
    : path === '/editor.js' ? { contentType: 'application/javascript; charset=utf-8', body: bundle }
      : { contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><style>body{font:16px/24px monospace;padding:40px}#composer{white-space:pre-wrap;overflow-wrap:anywhere;width:360px;max-height:140px;overflow:auto;border:1px solid;padding:12px}p{margin:0}</style><div id="composer" data-composer-input contenteditable="true" role="textbox" aria-multiline="true"></div><textarea id="other"></textarea><script src="/editor.js"></script><script src="/history.js"></script>' })
})
await page.coverage.startJSCoverage({ resetOnNavigation: false })
let coverage
try {
  await page.goto('http://caret.test'); await page.waitForLoadState('networkidle')
  await page.evaluate(() => fixture.install())
  const draft = Array.from({ length: 12 }, (_, i) => `line ${i}: alpha beta gamma delta`).join('\n')
  const middle = draft.indexOf('line 6:') + 12
  for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']) {
    await page.evaluate(() => fixture.history.dispose())
    await reset(draft); await select(middle); await press(key)
    const native = await snapshot()
    await page.evaluate(() => fixture.install())
    await reset(draft); await select(middle); await press(key)
    const actual = await snapshot()
    check(`${key} in the middle matches native composer movement`, actual.text === draft && actual.caret === native.caret && actual.requests === 0)
  }
  await reset(draft); await select(middle); await press('ArrowUp')
  const moved = await snapshot()
  await page.keyboard.type('X')
  check('typing after vertical movement edits the intended position', (await snapshot()).text === draft.slice(0, moved.caret) + 'X' + draft.slice(moved.caret))
  await reset(draft); await select(0); await press('ArrowDown')
  check('Down at the start moves within the draft', (await snapshot()).text === draft && (await snapshot()).requests === 0)
  await select(draft.length); await press('ArrowUp')
  check('Up at the end moves within the draft', (await snapshot()).text === draft && (await snapshot()).requests === 0)
  for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']) {
    await reset('first line\nmiddle line\nlast line')
    await select(3, 25); await press(key)
    check(`${key} with a selection preserves the draft`, (await snapshot()).text === 'first line\nmiddle line\nlast line' && (await snapshot()).requests === 0)
  }
  for (const [older, newer] of [['ArrowUp', 'ArrowDown'], ['PageUp', 'PageDown']]) {
    await reset('keep my\ncustom draft'); await select(0); await press(older)
    check(`${older} at the start recalls the latest complete input`, (await snapshot()).text === 'history 2\nsecond line')
    await select((await snapshot()).text.length); await press(newer)
    check(`${newer} at the end restores the original draft`, (await snapshot()).text === 'keep my\ncustom draft')
  }
  await reset(''); await select(0); await press('ArrowUp')
  check('empty paragraph placeholder permits history recall', (await snapshot()).text === 'history 2\nsecond line')
  await reset('\nmiddle\n'); await select(1); await press('ArrowUp')
  check('a leading empty paragraph is real editable content', (await snapshot()).text === '\nmiddle\n' && (await snapshot()).requests === 0)
  await select(7); await press('ArrowDown')
  check('a trailing empty paragraph is real editable content', (await snapshot()).text === '\nmiddle\n' && (await snapshot()).requests === 0)
  await reset('word'); await page.evaluate(() => fixture.linebreak()); await select(4); await press('ArrowDown')
  check('a real linebreak before the placeholder does not recall history', (await snapshot()).text === 'word\n' && (await snapshot()).requests === 0)
  await reset('word '.repeat(45)); await select(35); await press('ArrowUp')
  check('wrapped visual lines do not count as document boundaries', (await snapshot()).text === 'word '.repeat(45) && (await snapshot()).requests === 0)
  const reference = { source: 'file', ref: '/test.md', offset: 0, length: 8, label: 'test.md', clipboardText: '/test.md' }
  await reset({ text: '/test.md middle /test.md', references: [reference, { ...reference, offset: 16 }] })
  await select(1); await press('ArrowUp')
  check('a leading atomic reference prevents false start detection', (await snapshot()).references.length === 2 && (await snapshot()).requests === 0)
  await select(9); await press('ArrowDown')
  check('a trailing atomic reference prevents false end detection', (await snapshot()).references.length === 2 && (await snapshot()).requests === 0)
  await select(0); await press('ArrowUp'); await select((await snapshot()).text.length); await press('ArrowDown')
  check('boundary browsing restores semantic reference chips', (await snapshot()).references.length === 2 && (await snapshot()).text === '/test.md middle /test.md')
  await reset('held key'); await select(0)
  await page.keyboard.down('ArrowUp'); await select(0); await page.keyboard.down('ArrowUp'); await page.keyboard.up('ArrowUp')
  check('holding Up does not cascade through history', (await snapshot()).text === 'history 2\nsecond line')
  await select(0); await press('ArrowUp')
  check('releasing and pressing Up again allows another boundary recall', (await snapshot()).text === 'history 1\nsecond line')
  for (const action of ['caret', 'blur', 'typing']) {
    await reset('keep this draft'); await select(0); await page.evaluate(() => fixture.gate()); await press('ArrowUp')
    if (action === 'caret') await select(5)
    if (action === 'blur') await page.locator('#other').focus()
    if (action === 'typing') await page.keyboard.type('X')
    const before = (await snapshot()).text
    await page.evaluate(() => fixture.release()); await page.waitForTimeout(40)
    check(`${action} while loading cancels stale history replacement`, (await snapshot()).text === before)
  }
  check('browser has no runtime errors', errors.length === 0)
  await page.screenshot({ path: join(output, 'composer.png') })
  coverage = await page.coverage.stopJSCoverage()
  const entry = coverage.find(entry => entry.url === 'http://caret.test/history.js')
  assert.ok(entry, 'production history script has browser coverage')
  assert.equal(entry.source, source, 'browser coverage offsets must match the UTF-8 production source')
  const ranges = entry.functions.flatMap(fn => fn.ranges).sort((a, b) => (a.endOffset - a.startOffset) - (b.endOffset - b.startOffset))
  const diff = execFileSync('git', ['diff', process.env.DSH_COVERAGE_BASE || 'HEAD', '--unified=0', '--', 'client.history.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' })
  const added = new Set()
  let line = 0
  for (const row of diff.split('\n')) {
    const hunk = row.match(/^@@ .* \+(\d+)/)
    if (hunk) { line = Number(hunk[1]); continue }
    if (row.startsWith('+++') || row.startsWith('---')) continue
    if (row.startsWith('+')) { added.add(line); line++ }
    else if (row.startsWith(' ')) line++
  }
  let offset = 0
  const lines = source.split('\n').map((text, i) => {
    const start = offset + text.search(/\S|$/); offset += text.length + 1
    return { line: i + 1, text, covered: ranges.find(range => range.startOffset <= start && range.endOffset > start)?.count > 0 }
  }).filter(row => added.has(row.line) && row.text.trim() && !row.text.trim().startsWith('//'))
  const covered = lines.filter(row => row.covered).length
  if (lines.length) check(`changed production line coverage exceeds 70% (${covered}/${lines.length})`, covered / lines.length > 0.7)
  writeFileSync(join(output, 'coverage.json'), JSON.stringify({ changed: { covered, total: lines.length, percent: lines.length ? covered / lines.length * 100 : null, lines }, scripts: coverage.filter(entry => entry.url.endsWith('/history.js')) }, null, 2))
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png') })
  console.error('COMPOSER', await page.evaluate(() => ({ html: document.querySelector('[data-composer-input]').innerHTML, state: window.fixture?.snapshot(), key: window.fixture?.lastKey })).catch(() => null), errors)
  throw error
} finally {
  writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}
console.log(`${checks.length}/${checks.length} caret E2E checks passed`)

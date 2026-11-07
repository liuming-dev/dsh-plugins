import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire('/Users/liuming.liu/My/codespace/github/deepseek-harness/package.json')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<html><head></head><body><div data-composer-input contenteditable="true" id="composer"></div><textarea id="editor"></textarea></body></html>', { pretendToBeVisual: true })
const { window } = dom
Object.assign(globalThis, { window, document: window.document, Node: window.Node })
let factory
window.__ModuleLoader__ = { load: registration => { factory = registration.factory } }
new Function(readFileSync(new URL('../client.history.js', import.meta.url), 'utf8'))()
const changes = [], loads = [], notices = []
let currentSession = 'one', editing = false, deferList, deferLoad, phase = 'plain', revision = 0
let draft = { text: 'unsent draft', references: [] }
const input = {
  get draftSnapshot() { return draft },
  state: { getSnapshot: () => ({ draft: draft.text, draftRev: revision, phase, occurrences: draft.references }) },
  setDraft(value) {
    draft = structuredClone(typeof value === 'string' ? { text: value, references: [] } : value)
    revision++; changes.push(draft.text)
    document.getElementById('composer').textContent = draft.text
  },
  notify(level, message) { notices.push({ level, message }) },
}
let items = [1, 2, 3].map(n => ({ messageId: `u${n}`, seq: n, turn: n }))
let events = items.map(item => ({ event: { type: 'user/message', seq: item.seq, data: { id: item.messageId, source: { kind: 'user' }, content: [{ type: 'text', text: `message ${item.seq}\n${'x'.repeat(150)}` }] } } }))
const listeners = new Set()
const session = { eventSource: { getSnapshot: () => ({ entries: events }), subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) } }, loadThrough: async seq => { loads.push(seq); if (deferLoad) await deferLoad() } }
const ctx = {
  remote: { $mount: async () => () => {} },
  get: () => ({ listMessages: async () => { if (deferList) await deferList(); return { ok: true, value: { ok: true, items } } } }),
  sessions: { binding: () => ({ session }), scope: id => id }, conversation: { input: { for: () => input } },
}
const history = await factory().installHistory(ctx, { repaint() {}, sessionId: () => currentSession, isEditing: () => editing })
const composer = document.getElementById('composer')
composer.textContent = draft.text
composer.focus()
const tick = () => new Promise(resolve => setTimeout(resolve, 15))
const select = (node, start, end = start) => {
  const range = document.createRange()
  range.setStart(node, start); range.setEnd(node, end)
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
}
const edge = name => select(composer, ['ArrowUp', 'PageUp'].includes(name) ? 0 : composer.childNodes.length)
const press = async (name, target = composer, extra = {}) => {
  const event = new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...extra })
  target.dispatchEvent(event); await tick(); return event
}
const key = async (name, target = composer, extra = {}) => {
  if (target === composer) edge(name)
  return press(name, target, extra)
}
for (const name of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']) {
  input.setDraft('first line\nmiddle line\nlast line')
  for (const offset of [1, 14, draft.text.length - 1]) {
    select(composer.firstChild, offset)
    assert.equal((await press(name)).defaultPrevented, false, `${name} must edit at offset ${offset}`)
    assert.equal(draft.text, 'first line\nmiddle line\nlast line')
  }
  select(composer.firstChild, 0, draft.text.length)
  assert.equal((await press(name)).defaultPrevented, false, `${name} must preserve selection editing`)
  edge(name)
  assert.equal((await press(name, composer, { repeat: true })).defaultPrevented, false)
}
assert.deepEqual(loads, [])
console.log('PASS middle positions, noncollapsed selections and held keys never recall history')
for (const html of [
  '<p>first</p><p><span>middle</span></p><p>last</p>',
  '<p><br></p><p><span>middle</span></p><p><br></p>',
  '<p><span contenteditable="false">file</span><span>middle</span><span contenteditable="false">file</span></p>',
  '<p><span>middle</span><br><br></p>',
]) {
  composer.innerHTML = html
  const node = [...composer.querySelectorAll('span')].find(node => node.textContent === 'middle').firstChild
  for (const name of ['ArrowUp', 'PageUp']) {
    if (html.endsWith('<br><br></p>')) continue
    select(node, 0)
    assert.equal((await press(name)).defaultPrevented, false, `${name}: ${html}`)
  }
  for (const name of ['ArrowDown', 'PageDown']) {
    select(node, node.length)
    assert.equal((await press(name)).defaultPrevented, false, `${name}: ${html}`)
  }
}
console.log('PASS paragraphs, empty lines, real linebreaks and reference chips are not mistaken for document edges')
window.getSelection().removeAllRanges()
assert.equal((await press('ArrowUp')).defaultPrevented, false)
document.getElementById('editor').textContent = 'outside'
select(document.getElementById('editor').firstChild, 0)
assert.equal((await press('PageUp')).defaultPrevented, false)
input.setDraft('unsent draft')
console.log('PASS absent and external selections never trigger composer history')
const text = n => `message ${n}\n${'x'.repeat(150)}`
assert.equal((await key('ArrowUp')).defaultPrevented, true)
assert.equal(draft.text, text(3))
assert.equal((await key('PageUp')).defaultPrevented, true)
assert.equal(draft.text, text(2))
await key('ArrowDown'); assert.equal(draft.text, text(3))
await key('PageDown'); assert.equal(draft.text, 'unsent draft')
console.log('PASS both key groups recall complete multiline history and restore the unsent draft')
await key('PageDown'); assert.equal(draft.text, 'unsent draft')
await key('ArrowUp'); await key('ArrowUp'); await key('ArrowUp')
const atStart = changes.length
await key('PageUp'); assert.equal(changes.length, atStart)
await key('PageDown'); await key('PageDown'); await key('PageDown')
console.log('PASS bounds stop without wrapping or erasing the restored draft')
await key('ArrowUp'); input.setDraft('edited recalled input')
await key('PageUp'); assert.equal(draft.text, text(2))
await key('ArrowDown'); assert.equal(draft.text, 'edited recalled input')
await key('PageDown'); assert.equal(draft.text, 'unsent draft')
console.log('PASS edits made to a recalled message survive back and forth browsing')
const reference = { source: 'file', ref: '/test.md', offset: 5, length: 8, label: 'test.md', clipboardText: '/test.md' }
input.setDraft({ text: 'read /test.md', references: [reference] })
await key('ArrowUp'); await key('ArrowDown')
assert.deepEqual(draft, { text: 'read /test.md', references: [reference] })
console.log('PASS semantic draft restoration preserves reference chips')
for (const extra of [{ ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }]) {
  assert.equal((await key('ArrowUp', composer, extra)).defaultPrevented, false)
}
composer.setAttribute('data-composer-composing', '')
assert.equal((await key('PageUp')).defaultPrevented, false)
composer.removeAttribute('data-composer-composing')
for (const role of ['listbox', 'menu']) {
  const menu = document.createElement('div'); menu.setAttribute('role', role); document.body.append(menu)
  assert.equal((await key('PageUp')).defaultPrevented, false); menu.remove()
}
console.log('PASS modifiers, IME composition and completion menus retain native keys')
for (const value of ['claimed', 'submitting', 'adjudicating']) {
  phase = value; assert.equal((await key('ArrowUp')).defaultPrevented, false)
}
phase = 'plain'; editing = true
assert.equal((await key('PageUp')).defaultPrevented, false); editing = false
assert.equal((await key('ArrowUp', document.getElementById('editor'))).defaultPrevented, false)
console.log('PASS command mode, pending submission, inline editor and unrelated inputs are protected')
// A loaded history page can arrive after typing. The older response must not overwrite the new revision.
currentSession = 'race'; history.setSession(currentSession)
let release
const pending = new Promise(resolve => { release = resolve })
deferList = () => pending
edge('PageUp')
composer.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }))
input.setDraft('typed while loading')
release(); await tick(); deferList = undefined
assert.equal(draft.text, 'typed while loading')
console.log('PASS asynchronous history reads never overwrite newer typing')
await key('ArrowUp'); assert.equal(draft.text, text(3))
currentSession = 'other'; history.setSession(currentSession); input.setDraft('other session draft')
await key('PageDown'); assert.equal(draft.text, 'other session draft')
currentSession = 'race'; history.setSession(currentSession); input.setDraft(text(3))
await key('ArrowDown'); assert.equal(draft.text, 'typed while loading')
console.log('PASS original drafts are isolated between sessions')
await key('ArrowUp')
input.setDraft('')
items = [...items, { messageId: 'u4', seq: 4, turn: 4 }]
events.push({ event: { type: 'user/message', seq: 4, data: { id: 'u4', source: { kind: 'user' }, content: [{ type: 'text', text: 'newly sent input' }] } } })
for (const listener of listeners) listener()
await key('ArrowUp'); assert.equal(draft.text, 'newly sent input')
await key('ArrowDown'); assert.equal(draft.text, '')
console.log('PASS a newly sent input starts a new recall sequence with the current draft')
currentSession = 'error'; history.setSession(currentSession); input.setDraft('safe draft')
deferLoad = async () => { throw new Error('load failed') }
await key('PageUp'); deferLoad = undefined
assert.equal(draft.text, 'safe draft'); assert.equal(notices.at(-1).message, 'load failed')
console.log('PASS failed history loading preserves the draft and surfaces a notice')
items.push({ messageId: 'u5', seq: 5, turn: 5 })
events.push({ event: { type: 'user/message', seq: 5, data: { id: 'u5', source: { kind: 'user' }, content: [{ type: 'image', data: 'fixture', mediaType: 'image/png' }] } } })
for (const listener of listeners) listener()
await key('ArrowUp'); assert.equal(draft.text, 'newly sent input')
await key('ArrowDown'); assert.equal(draft.text, 'safe draft')
console.log('PASS attachment-only history is skipped without clearing the original draft')

currentSession = 'switch-race'; history.setSession(currentSession)
let finish
const loading = new Promise(resolve => { finish = resolve })
deferLoad = () => loading
edge('PageUp')
composer.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }))
await tick(); currentSession = 'changed'; history.setSession(currentSession); input.setDraft('new session draft')
finish(); await tick(); deferLoad = undefined
assert.equal(draft.text, 'new session draft')
assert.ok(loads.includes(3))
console.log('PASS session switches invalidate pending recalls before they can write')
for (const moved of ['caret', 'selection', 'blur']) {
  currentSession = `move-${moved}`; history.setSession(currentSession); input.setDraft('keep this draft'); composer.focus()
  let finish
  const loading = new Promise(resolve => { finish = resolve })
  deferLoad = () => loading
  edge('PageUp')
  composer.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }))
  await tick()
  if (moved === 'blur') document.getElementById('editor').focus()
  else select(composer.firstChild, 2, moved === 'selection' ? 6 : 2)
  finish(); await tick(); deferLoad = undefined
  assert.equal(draft.text, 'keep this draft', `pending recall must not override ${moved}`)
}
composer.focus()
console.log('PASS moving the caret, selecting text and leaving the composer cancel pending recalls')
currentSession = 'placeholder'; history.setSession(currentSession); input.setDraft('')
composer.innerHTML = '<p><br></p>'; select(composer.firstChild, 0)
assert.equal((await press('ArrowUp')).defaultPrevented, true)
assert.equal(draft.text, 'newly sent input')
composer.innerHTML = '<p><span>newly sent input</span><br></p>'
select(composer.querySelector('span').firstChild, 'newly sent input'.length)
assert.equal((await press('ArrowDown')).defaultPrevented, true)
assert.equal(draft.text, '')
console.log('PASS empty editors and terminal placeholder breaks still allow boundary recall and restoration')
await history.dispose()
assert.equal((await key('PageUp')).defaultPrevented, false)
console.log('PASS disposal removes composer shortcuts')
console.log('18/18 composer recall checks passed')

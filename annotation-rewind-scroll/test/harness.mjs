/**
 * jsdom 集成夹具：隐形挂载 + 工具栏计数胶囊 + 发送后清理。
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const repo = '/Users/liuming.liu/My/codespace/github/deepseek-harness'
const requireFromUiChat = createRequire(`${repo}/packages/client/ui-chat/package.json`)
const requireFromRepo = createRequire(`${repo}/package.json`)

const React = requireFromUiChat('react')
requireFromUiChat('react-dom')
const { createRoot } = requireFromUiChat('react-dom/client')
const { Simulate } = requireFromUiChat('react-dom/test-utils')
const { JSDOM } = requireFromRepo('jsdom')

const h = React.createElement
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
}

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="chat">
    <div data-chat-node-key="assistant:3" data-chat-turn="3" data-chat-flow-kind="assistant-step">
      <div class="body"><p>这是一段足够长的回答文本，用来验证选中之后会出现添加注释的胶囊按钮。</p></div>
    </div>
  </div>
  <div id="root"></div>
</body></html>`, { url: 'http://localhost/', pretendToBeVisual: true })

globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.NodeFilter = dom.window.NodeFilter
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.KeyboardEvent = dom.window.KeyboardEvent
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.Node = dom.window.Node
globalThis.localStorage = dom.window.localStorage
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.IS_REACT_ACT_ENVIRONMENT = false
dom.window.HTMLElement.prototype.attachEvent = function () {}
dom.window.HTMLElement.prototype.detachEvent = function () {}

const dictionaries = {}
const DICT = {
  'pill.add': '添加注释',
  'pill.addLabel': '添加注释',
  'pill.short': '注释',
  'dock.title': '注释',
  'dock.countLabel': ' 条注释',
  'dialog.hint': '⌘ ↵',
  'note.title': '添加注释',
  'note.titleEdit': '编辑注释',
  'note.placeholder': '补充你的意见…',
  'note.send': '保存注释',
  'note.delete': '删除注释',
  'note.cancel': '取消',
  'note.save': '保存',
  'marker.open': '查看第 {index} 条注释',

  'dock.count': '{count} 条注释',
  'dialog.title': '添加注释',
  'dialog.placeholder': '这条引用需要我怎么处理？',
  'dialog.cancel': '取消',
  'dialog.save': '添加',
  'dialog.source.message': '来源：第 {turn} 轮回答',
  'dialog.source.document': '来源：{path} 第 {line} 行',
  'row.message': '第 {turn} 轮回答',
  'row.document': '{path} 第 {line} 行',
  'row.currentDocument': '当前文档',
  'row.comment': '用户评论',
  'row.edit': '编辑注释',
  'row.remove': '删除注释',
  'edit.save': '保存',
  'edit.cancel': '取消',
  'dock.hint': '{count} 条注释，随下一条消息发送',
  'dock.sentWithNext': '随下一条消息发送',
  'prompt.header': '〔注释〕以下是我对你输出的注释，请结合引用内容理解我的意图。',
  'prompt.answer': '你之前的回答',
  'prompt.document': '当前文档',
  'prompt.file': '文件',
  'error.sessionNotReady': '会话未就绪。',
  'error.composerNotReady': '输入框未就绪。',
  'error.insertFailed': '挂载失败。',
}
const translate = (key, params) => {
  let text = DICT[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

const registered = { slots: new Map(), sources: [], disposers: [] }
const inserted = []
const fakeInput = { insertReference(reference, span) { inserted.push({ reference, span }); return true } }
const fakeCtx = {
  effect(callback) { const dispose = callback(); registered.disposers.push(dispose); return dispose },
  locale: { register: (_ns, lang, dict) => { dictionaries[lang] = dict; if (lang === 'zh') Object.assign(DICT, dict); return () => {} }, bind: () => translate },
  sessions: { scope: () => ({}) },
  conversation: { sendSession: async () => ({kind:'success'}), input: { for: () => fakeInput } },
  inputTriggers: { registerSource(source) { registered.sources.push(source); return () => {} } },
  slots: {
    inject(key, callback) { const dispose = callback(); registered.disposers.push(dispose); return () => {} },
    register(options, component) {
      // 内置附件已占用 single 插槽；扩展必须使用工具栏的 list 插槽。
      if (options.name === 'conversation.input.attachments') throw new Error('single attachment slot already occupied')
      registered.slots.set(`${options.name}#${options.id ?? options.key ?? ''}`, { options, component })
      return () => {}
    },
  },
}

let factory
dom.window.__ModuleLoader__ = { load: ({ factory: made }) => { factory = made } }
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
new Function('window', 'document', 'navigator', 'CSS', 'Highlight', 'NodeFilter', 'MutationObserver', 'localStorage', 'console', source)(
  dom.window, dom.window.document, dom.window.navigator, undefined, undefined,
  dom.window.NodeFilter, dom.window.MutationObserver, dom.window.localStorage, console,
)
const ReactDom = requireFromUiChat('react-dom')
const plugin = factory((specifier) => {
  if (specifier === 'react') return React
  if (specifier === 'react-dom') return ReactDom
  throw new Error(`unexpected require ${specifier}`)
})
plugin.apply(fakeCtx)
const codec = registered.sources[0].codec
const api = dom.window.__dshAnnotation
const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms))
const waitFor = async (predicate, timeout = 1500) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = predicate()
    if (value) return value
    await tick(20)
  }
  return undefined
}

check('message action badge is gone', !registered.slots.has('conversation.chat.assistant-actions#annotation'))
check('document actions anchor registered', registered.slots.has('sidebar.right.tab.document.actions#annotation'))

const root = createRoot(document.getElementById('root'))
const dock = registered.slots.get('conversation.input.left#annotation').component
let draftState = { draft: '问题正文', draftRev: 3 }
const setDraft = (text) => { draftState = { draft: text, draftRev: draftState.draftRev + 1 } }
const renderDock = (text, rev = draftState.draftRev) => {
  draftState = { draft: text, draftRev: rev }
  root.render(h(dock, {
    sessionId: 's1',
    useInput: selector => selector(draftState),
    inputActions: { setDraft },
    t: translate,
  }))
}

function selectText(node, end) {
  const range = document.createRange()
  range.setStart(node, 0)
  range.setEnd(node, end)
  const selection = dom.window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }))
}

async function closeAnyDialog() {
  const cancel = [...document.querySelectorAll('[data-dsh-annotation-ui] button')].find(b => (b.textContent || '') === '取消')
  cancel?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await tick(40)
}

async function addAnnotation(comment) {
  const trigger = await waitFor(() => [...document.querySelectorAll('button')].find(b => b.className.includes('dsa-pill') && /注释/.test(b.textContent || '')))
  trigger?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  const area = await waitFor(() => document.querySelector('.dsa-note__area'))
  if (!area) return false
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(area, comment)
  Simulate.change(area, { target: { value: comment } })
  await tick(30)
  area.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(60)
  return true
}

// ── 4. 文档注释 ───────────────────────────────────────────────────────────
await closeAnyDialog()
renderDock('问题正文')
await tick(40)
const docHost = document.createElement('div')
document.body.appendChild(docHost)
createRoot(docHost).render(h(registered.slots.get('sidebar.right.tab.document.actions#annotation').component, {
  absolutePath: 'research/design.md', sessionId: 's1', t: translate,
}))
await tick(40)

const preview = document.createElement('div')
preview.setAttribute('data-textpreview-plain', '')
preview.innerHTML = '<pre data-textpreview-page="0"><div data-textpreview-line="42">这一行是需要补充 fork 用例的说明文字。</div></pre>'
document.body.appendChild(preview)
selectText(preview.querySelector('[data-textpreview-line="42"]').firstChild, 12)
await tick(60)
await addAnnotation('这一行重写，并补两条 fork 用例。')

const docItems = api.items().filter(a => a.kind === 'document')
check('document annotation records path and line', docItems.length === 1 && docItems[0].path === 'research/design.md' && docItems[0].line === 42,
  docItems.map(a => ({ path: a.path, line: a.line })))
check('document appendix names file and line', (await api.probe('s1')).includes('文件 research/design.md 第 42 行'))

// 清场：只有宿主接受消息后才清理本次注释
await fakeCtx.conversation.sendSession({sessionId:'s1'}, '文档注释正文', [], 'queue')
renderDock('')
await tick(80)
inserted.length = 0


// ── 1. 有正文时：不修改正文 ─────────────────────────────────────────────────
renderDock('问题正文')
await tick(60)
selectText(document.querySelector('[data-chat-node-key] p').firstChild, 18)
await tick(60)
await addAnnotation('这段请展开讲，并给一个反例。')

check('saving annotations leaves the existing draft unchanged', draftState.draft === '问题正文' && inserted.length === 0)
check('draft contains no annotation zero-width characters', !draftState.draft.includes('\u200B'))
check('legacy reference codec cannot duplicate the appendix', await codec.serialize('s1') === '')
check('composer dock shows the count chip', /1 条注释/.test(document.body.textContent || ''))

const chip = [...document.querySelectorAll('button')].find(b => /1 条注释/.test(b.textContent || ''))
chip?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await tick(40)
Simulate.mouseLeave(document.querySelector('[data-dsh-annotation-chip]').parentElement)
await tick(230)
check('clicked annotation list stays open after pointer leaves', Boolean(document.querySelector('.dsa-pop')))
const listText = document.body.textContent || ''
check('list shows quote, comment and actions',
  listText.includes('这是一段足够长的回答文本') && listText.includes('这段请展开讲')
  && Boolean(document.querySelector('button[aria-label="编辑注释"]'))
  && Boolean(document.querySelector('button[aria-label="删除注释"]')))

const appendix = await api.probe('s1')
check('appendix starts with ---', appendix.trimStart().startsWith('---'), JSON.stringify(appendix.slice(0, 20)))
check('appendix is numbered and keeps quote', appendix.includes('1) 针对：第 3 轮回答') && appendix.includes('> 这是一段足够长的回答文本'))

document.querySelector('button[aria-label="编辑注释"]')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await tick(40)
const editor = document.querySelector('[data-dsh-annotation-ui] textarea')
if (editor) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(editor, '改过的评论')
  Simulate.change(editor, { target: { value: '改过的评论' } })
}
await tick(30)
;[...document.querySelectorAll('button')].find(b => (b.textContent || '') === '保存')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await tick(40)
check('edit updates the appendix', (await api.probe('s1')).includes('改过的评论'))

// ── 2. 原生发送成功后清理 ──────────────────────────────────────
await fakeCtx.conversation.sendSession({sessionId:'s1'}, '消息正文', [], 'queue')
renderDock('')
await tick(60)
check('send clears the annotations', api.items().length === 0, api.items().length)
check('empty draft renders no chip', !/条注释/.test(document.body.textContent || ''))

// ── 3. 空正文时不挂载（保留占位符）──────────────────────────────────────
await closeAnyDialog()
inserted.length = 0
renderDock('')
await tick(40)
selectText(document.querySelector('[data-chat-node-key] p').firstChild, 18)
await tick(40)
await addAnnotation('空正文时先不挂载')
check('empty draft does not attach', inserted.length === 0, inserted.length)
check('pending still listed in tool row', /1 条注释/.test(document.body.textContent || ''))

// 用户开始输入不会挂载任何隐藏引用
renderDock('开始输入')
await tick(60)
check('typing leaves annotation records outside the draft', inserted.length === 0 && draftState.draft === '开始输入', inserted)

// 清空正文只清理正文，不误删待发送注释
renderDock('')
await tick(60)
check('clearing text retains pending notes without inserting characters', draftState.draft === '' && api.items().length === 1, draftState)
await fakeCtx.conversation.sendSession({sessionId:'s1'}, '开始新一轮测试', [], 'queue')
await tick(40)



// Production dictionaries, instead of fixture-only copy, define the bilingual contract.
check('Chinese and English dictionaries have complete key parity',
  JSON.stringify(Object.keys(dictionaries.zh).sort()) === JSON.stringify(Object.keys(dictionaries.en).sort()))
Object.assign(DICT, dictionaries.en)
renderDock('English input')
await tick(50)
selectText(document.querySelector('[data-chat-node-key] p').firstChild, 18)
await tick(50)
check('English selection action is translated', document.querySelector('.dsa-pill')?.textContent === 'Add annotation')
document.querySelector('.dsa-pill').click()
await tick(40)
const englishArea = document.querySelector('.dsa-note__area')
Simulate.change(englishArea, { target: { value: 'Clarify this passage.' } })
await tick(30)
const beforeComposition = api.items().length
englishArea.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
await tick(30)
check('IME confirmation does not save or close the annotation', api.items().length === beforeComposition && Boolean(document.querySelector('.dsa-note__area')))
englishArea.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
await tick(50)
const englishAppendix = await api.probe('s1')
check('English appendix uses English metadata throughout', englishAppendix.includes('Regarding: Answer in turn 3') && englishAppendix.includes('Quote:') && englishAppendix.includes('Annotation: Clarify') && !englishAppendix.includes('针对：'))
document.querySelector('[data-dsh-annotation-chip]').click()
await tick(40)
check('English relative time and clear-all are translated', document.querySelector('.dsa-item__when')?.textContent === 'Just now' && document.querySelector('.dsa-pop__clear')?.textContent === 'Clear all')
document.querySelector('.dsa-pop__clear').click()
await tick(60)
check('clear-all removes list, markers and serialized notes', api.items().length === 0 && !document.querySelector('.dsa-pop') && !document.querySelector('.dsa-marker') && await api.probe('s1') === '')
Object.assign(DICT, dictionaries.zh)
renderDock('文档范围')
await tick(40)
preview.querySelector('pre').insertAdjacentHTML('beforeend', '<div data-textpreview-line="43">第二行需要一起引用。</div>')
const multi = document.createRange()
multi.setStart(preview.querySelector('[data-textpreview-line="42"]').firstChild, 0)
multi.setEnd(preview.querySelector('[data-textpreview-line="43"]').firstChild, 6)
window.getSelection().removeAllRanges(); window.getSelection().addRange(multi)
document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }))
await tick(40)
await addAnnotation('保留起止行')
const ranged = api.items().at(-1)
check('document selections preserve both start and end lines', ranged?.line === 42 && ranged?.endLine === 43)
check('appendix names the selected line range', (await api.probe('s1')).includes('第 42–43 行'))

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
root.unmount()
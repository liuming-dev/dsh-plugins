/**
 * dockkit 面板夹具：better-sidebar「审查」文件页（DSH 右栏 dockkit 承载）里的选区应能注释并取到路径。
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
const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms))
const waitFor = async (fn, timeout = 2000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = fn()
    if (value) return value
    await tick(20)
  }
  return undefined
}

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="dock"></div>
  <div data-dockkit-pane id="pane">
    <div><input id="pathInput" value="plugins/dsh-annotation-rewind-scroll/client.js"></div>
    <div class="cm-content"><p>dockkit 面板里的选区文本，用来验证路径探测是否生效。</p></div>
  </div>
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
  'dock.hint': '{count} 条注释，随下一条消息发送',
  'dock.sentWithNext': '随下一条消息发送',
  'dialog.title': '添加注释',
  'dialog.placeholder': '这条引用需要我怎么处理？',
  'dialog.cancel': '取消',
  'dialog.save': '添加',
  'dialog.source.document': '来源：{path} 第 {line} 行',
  'row.document': '{path} 第 {line} 行',
  'row.currentDocument': '当前文档',
  'row.comment': '用户评论',
  'row.edit': '编辑注释',
  'row.remove': '删除注释',
  'edit.save': '保存',
  'edit.cancel': '取消',
  'prompt.header': '〔注释〕以下是我对你输出的注释，请结合引用内容理解我的意图。',
  'prompt.document': '当前文档',
  'prompt.file': '文件',
}
const translate = (key, params) => {
  let text = DICT[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

const inserted = []
const registered = { slots: new Map(), sources: [] }
const fakeCtx = {
  effect(cb) { return cb() },
  locale: { register: (_ns, lang, dict) => { if (lang === 'zh') Object.assign(DICT, dict); return () => {} }, bind: () => translate },
  sessions: { scope: () => ({}) },
  conversation: { sendSession: async () => ({kind:'success'}), input: { for: () => ({ insertReference(reference, span) { inserted.push({ reference, span }); return true } }) } },
  inputTriggers: { registerSource(source) { registered.sources.push(source); return () => {} } },
  slots: {
    inject(key, cb) { cb(); return () => {} },
    register(options, component) {
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
const api = dom.window.__dshAnnotation
const codec = registered.sources[0].codec

async function addAnnotation(comment) {
  const pill = await waitFor(() => [...document.querySelectorAll('button')].find(b => /注释/.test(b.textContent || '') && b.className.includes('dsa-pill')))
  pill?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  const card = await waitFor(() => document.querySelector('.dsa-note__area'))
  if (!card) return false
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(card, comment)
  Simulate.change(card, { target: { value: comment } })
  await tick(30)
  card.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(60)
  return true
}

const root = createRoot(document.getElementById('dock'))
let draftState = { draft: '问题正文', draftRev: 2 }
root.render(h(registered.slots.get('conversation.input.left#annotation').component, {
  sessionId: 's1',
  useInput: selector => selector(draftState),
  inputActions: { setDraft: (text) => { draftState = { draft: text, draftRev: draftState.draftRev + 1 } } },
  t: translate,
}))
await tick(60)

// 在 dockkit 面板内划选
const paragraph = document.querySelector('[data-dockkit-pane] p').firstChild
const range = document.createRange()
range.setStart(paragraph, 0)
range.setEnd(paragraph, 14)
const selection = dom.window.getSelection()
selection.removeAllRanges()
selection.addRange(range)
document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }))

const trigger = await waitFor(() => document.querySelector('.dsa-pill'))
check('dockkit pane selection shows the note trigger', Boolean(trigger))
await addAnnotation('这段补充一个反例。')
check('note card opens and takes the comment', api.items().length === 1)

const items = api.items()
check('annotation is recorded as a document', items.length === 1 && items[0].kind === 'document', items)
check('path comes from the pane header', items[0]?.path === 'plugins/dsh-annotation-rewind-scroll/client.js', items[0]?.path)
const activeRef = inserted.length === 0 ? 's1' : inserted[inserted.length - 1].reference.ref
const appendix = await api.probe('s1')
check('appendix names the file', appendix.includes('文件 plugins/dsh-annotation-rewind-scroll/client.js'), JSON.stringify(appendix))
check('appendix keeps quote and comment', appendix.includes('dockkit') && appendix.includes('补充一个反例'))
check('document annotations never insert hidden editor references', inserted.length === 0, inserted)

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
root.unmount()
/**
 * 用户消息编辑夹具：悬停出铅笔 → 打开编辑卡片 → 发送时回退并重填草稿。
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
  <div data-chat-node-key="13:input-messageoriginal-42" data-chat-flow-kind="user" data-chat-turn="1" id="userNode">
    <div class="host_userRow"><div class="host_userStack"><div class="host_bubble"><p>请说明如何提出清晰的反馈。</p></div></div>
      <div data-clock="start"><span>19:45</span><button class="host_action" aria-label="复制">复制</button></div>
    </div>
  </div>
  <div data-chat-node-key="assistant:43" data-chat-flow-kind="assistant-step"><button aria-label="复制">回答复制</button></div>
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
  'dock.countLabel': ' 条注释',
  'dock.title': '注释',
  'dock.hint': '{count} 条注释，随下一条消息发送',
  'dock.sentWithNext': '随下一条消息发送',
  'dock.clear': '清空',
  'note.title': '添加注释',
  'note.titleEdit': '编辑注释',
  'note.placeholder': '补充你的意见…',
  'note.send': '保存注释',
  'note.delete': '删除注释',
  'note.cancel': '取消',
  'note.save': '保存',
  'edit.message': '编辑消息',
  'edit.title': '编辑消息',
  'edit.send': '发送',
  'marker.open': '查看第 {index} 条注释',
  'row.comment': '用户评论',
  'row.edit': '编辑注释',
  'row.remove': '删除注释',
  'row.message': '第 {turn} 轮回答',
  'row.document': '{path} 第 {line} 行',
  'row.currentDocument': '当前文档',
  'pill.short': '添加注释',
}
const translate = (key, params) => {
  let text = DICT[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

const commands = []
const drafts = []
let failSubmit = false
const originalContent = [{type:'image',attachment:{attachmentId:'fixture-image',mediaType:'image/png'}},{type:'text',text:'请说明如何提出清晰的反馈。'}]
const registered = { slots: new Map(), sources: [] }
const fakeCtx = {
  effect(cb) { return cb() },
  locale: { register: (_ns, lang, dict) => { if (lang === 'zh') Object.assign(DICT, dict); return () => {} }, bind: () => translate },
  sessions: {
    scope: () => ({ sessionId: 's1' }),
    binding: () => ({ session: {
      eventSource: { getSnapshot: () => ({entries:[{type:'event',event:{type:'user/message',seq:42,data:{id:'original-42',content:originalContent}}}]}) },

      prompt: async content => { drafts.push(content); return {ok:true,value:{accepted:true}} },
    } }),
  },
  conversation: {
    sendSession: async () => ({kind:'success'}),
    input: {
      for: () => ({
        setDraft: (text) => { drafts.push(text) },
        insertReference: () => true,
        submit: () => { drafts.push('<submit>') },
      }),
    },
  },
  inputTriggers: { registerSource(source) { registered.sources.push(source); return () => {} } },
  slots: {
    inject(key, cb) { cb(); return () => {} },
    register(options, component) {
      registered.slots.set(`${options.name}#${options.id ?? ''}`, { options, component })
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
const requirePlugin = specifier => {
  if (specifier === 'react') return React
  if (specifier === 'react-dom') return ReactDom
  throw new Error(`unexpected require ${specifier}`)
}
requirePlugin.async = async () => ({ installHistory: async () => ({
  setSession() {}, syncVisibility() {}, dispose() {},
  async edit(id, request) {
    commands.push(request)
    if (failSubmit) throw new Error('保存失败，请重试。')
    drafts.push(request)
    return {ok:true}
  },
}) })
const plugin = factory(requirePlugin)
plugin.apply(fakeCtx)

const root = createRoot(document.getElementById('dock'))
let draftState = { draft: '', draftRev: 1 }
root.render(h(registered.slots.get('conversation.input.left#annotation').component, {
  sessionId: 's1',
  useInput: selector => selector(draftState),
  inputActions: { setDraft: (text) => { draftState = { draft: text, draftRev: draftState.draftRev + 1 } } },
  t: translate,
}))
await tick(60)


const node = document.getElementById('userNode')
const row = node.querySelector('[data-clock="start"]')
const bubble = node.querySelector('.host_bubble')
const pencil = await waitFor(() => document.querySelector('.dsa-edit'))
check('one edit pencil for the user, none for the assistant', document.querySelectorAll('.dsa-edit').length === 1)
check('pencil is inside its own clock/copy row', Boolean(pencil && row.contains(pencil)))
check('pencil follows the copy button in document order', Boolean(pencil && row.contains(pencil) && (row.querySelector('[aria-label="复制"]').compareDocumentPosition(pencil) & 4)))
check('pencil inherits the copy action class', pencil?.classList.contains('host_action'))
pencil?.click()
let area = await waitFor(() => document.querySelector('.dsa-inline-edit__area'))
check('editor lives inside the original user bubble layout', Boolean(area && bubble.parentElement.contains(area)))
check('editor contains exact source text without time or button labels', area?.value === '请说明如何提出清晰的反馈。', area?.value)
check('original bubble is hidden during editing', bubble.hasAttribute('data-dsa-editing'))
const cancel = () => [...document.querySelectorAll('.dsa-inline-edit button')].find(b => b.textContent === '取消')?.click()
cancel()
await tick(60)
check('cancel restores the original bubble and never edit requests', !bubble.hasAttribute('data-dsa-editing') && commands.length === 0 && !document.querySelector('.dsa-inline-edit'))

document.querySelector('.dsa-edit')?.click()
area = await waitFor(() => document.querySelector('.dsa-inline-edit__area'))
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
setter.call(area, '请说明如何提出清晰、可执行的反馈。')
Simulate.change(area, {target:{value:'请说明如何提出清晰、可执行的反馈。'}})
await tick(30)
const send = () => [...document.querySelectorAll('.dsa-inline-edit button')].find(b => b.textContent === '发送')?.click()
failSubmit = true
send()
await tick(60)
check('failed edit request keeps editor and draft open', Boolean(document.querySelector('.dsa-inline-edit__area')))
check('failed edit request does not send a new message', drafts.length === 0)
check('failed edit request reports a visible error', Boolean(document.querySelector('.dsa-inline-edit [role="alert"]')))
failSubmit = false
send()
await tick(80)
check('UUID node key resolves to the real event sequence', commands.length === 2 && commands.every(r => r.seq === 42 && r.messageId === 'original-42') && commands[0].requestId === commands[1].requestId, commands)
check('browser sends only the edited text; the Host owns original attachments', drafts[0]?.text === '请说明如何提出清晰、可执行的反馈。' && !('content' in drafts[0]),drafts)
check('successful send closes the inline editor', !document.querySelector('.dsa-inline-edit'))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exitCode = 1
root.unmount()

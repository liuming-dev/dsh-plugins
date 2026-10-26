/**
 * 追加位置夹具：附录必须落在用户输入最后面。
 * 单独一个进程运行，避免与主夹具的场景互相污染。
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
  'dialog.source.message': '来源：第 {turn} 轮回答',
  'row.message': '第 {turn} 轮回答',
  'row.document': '{path} 第 {line} 行',
  'row.currentDocument': '当前文档',
  'row.comment': '用户评论',
  'row.edit': '编辑注释',
  'row.remove': '删除注释',
  'edit.save': '保存',
  'edit.cancel': '取消',
  'prompt.header': '〔注释〕以下是我对你输出的注释，请结合引用内容理解我的意图。',
  'prompt.answer': '你之前的回答',
  'prompt.document': '当前文档',
  'prompt.file': '文件',
}
const translate = (key, params) => {
  let text = DICT[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

const registered = { slots: new Map(), sources: [] }
const inserted = [], sent = [], disposers = []
let sinkBehavior = async () => ({ kind: 'success' })
const fakeInput = { insertReference(reference, span) { inserted.push({ reference, span }); return true } }
const fakeCtx = {
  effect(callback) { const dispose = callback(); disposers.push(dispose); return dispose },
  locale: { register: (_ns, lang, dict) => { if (lang === 'zh') Object.assign(DICT, dict); return () => {} }, bind: () => translate },
  sessions: { scope: () => ({}) },
  conversation: { input: { for: () => fakeInput }, async sendSession(...args) { sent.push(args); return sinkBehavior(...args) } },
  inputTriggers: { registerSource(source) { registered.sources.push(source); return () => {} } },
  slots: {
    inject(key, callback) { callback(); return () => {} },
    register(options, component) {
      registered.slots.set(`${options.name}#${options.id ?? options.key ?? ''}`, { options, component })
      return () => {}
    },
  },
}

let factory
dom.window.__ModuleLoader__ = { load: ({ factory: made }) => { factory = made } }
const source = readFileSync(process.env.DSH_CLIENT_FILE || new URL('../client.js', import.meta.url), 'utf8')
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
const waitFor = async (fn, timeout = 2000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = fn()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return undefined
}
const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms))
const ZWSP = '\u200B'

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

const root = createRoot(document.getElementById('root'))
const dock = registered.slots.get('conversation.input.left#annotation').component
let draftState = { draft: '问题正文', draftRev: 5 }
const render = (text, rev = draftState.draftRev) => {
  draftState = { draft: text, draftRev: rev }
  root.render(h(dock, {
    sessionId: 's1',
    useInput: selector => selector(draftState),
    inputActions: { setDraft: (next) => { draftState = { draft: next, draftRev: draftState.draftRev + 1 } } },
    t: translate,
  }))
}

function select(node, end) {
  const range = document.createRange()
  range.setStart(node, 0)
  range.setEnd(node, end)
  const selection = dom.window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }))
}

// 经过插件的实际 UI 创建，再经过原生默认发送入口；不调用模型或用户会话。
const addNote = async comment => { select(document.querySelector('[data-chat-node-key] p').firstChild, 16); await tick(30); await addAnnotation(comment) }
render('问题正文');await tick(60);await addNote('附录内容一')
await tick(350)
check('saving annotations does not insert hidden characters into the editor', inserted.length === 0, inserted.map(i=>i.reference.clipboardText))
for (const text of ['问题正文继续','问题正文继续输入','问题正文继续输入最后一句']) {
 render(text,draftState.draftRev+1);await tick(40)
 document.getElementById('root').dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true}))
 await tick(80)
}
await tick(350)
check('typing, pausing and clicking never insert annotation references',inserted.length===0,inserted.length)
const nativeSignal=new AbortController().signal, attachments=['image-id','file-id']
await fakeCtx.conversation.sendSession({sessionId:'s1'},'完整正文及已展开的文件引用',attachments,'steer',nativeSignal)
const first=sent.at(-1)
check('annotations are appended after the complete serialized message',first[1].startsWith('完整正文及已展开的文件引用')&&first[1].includes('附录内容一')&&first[1].indexOf('---')>0,first[1])
check('the appendix occurs once and contains no plugin zero-width characters',first[1].split('附录内容一').length===2&&!first[1].includes(ZWSP))
check('native attachment, delivery mode and cancellation arguments survive',first[2]===attachments&&first[3]==='steer'&&first[4]===nativeSignal)
check('successful admission removes the submitted pending annotations',dom.window.__dshAnnotation.items().length===0)
await addNote('失败后仍待发送')
sinkBehavior=async()=>({kind:'error',text:'admission failed'})
await fakeCtx.conversation.sendSession({sessionId:'s1'},'失败正文',[],'queue')
check('failed admission retains pending annotations',dom.window.__dshAnnotation.items().some(i=>i.comment==='失败后仍待发送'))
sinkBehavior=async()=>{throw new Error('connection lost')}
await fakeCtx.conversation.sendSession({sessionId:'s1'},'断连正文',[],'queue').catch(()=>{})
check('transport failure also retains annotations for retry',dom.window.__dshAnnotation.items().length===1)
sinkBehavior=async()=>({kind:'success'})
await fakeCtx.conversation.sendSession({sessionId:'other'},'其他会话',[],'queue')
check('pending annotations never attach to another session',sent.at(-1)[1]==='其他会话'&&dom.window.__dshAnnotation.items().length===1)
let release
sinkBehavior=()=>new Promise(resolve=>{release=resolve})
const inFlight=fakeCtx.conversation.sendSession({sessionId:'s1'},'第一条进行中',[],'queue')
await tick(30)
await addNote('请求期间新增')
const firstRelease=release
sinkBehavior=async()=>({kind:'success'})
await fakeCtx.conversation.sendSession({sessionId:'s1'},'第二条正文',[],'queue')
check('concurrent sends reserve each annotation for only one message',!sent.at(-1)[1].includes('失败后仍待发送')&&sent.at(-1)[1].includes('请求期间新增'))
firstRelease({kind:'success'});await inFlight
check('completed batches remove only their own annotations',dom.window.__dshAnnotation.items().length===0)
await addNote('停用前的注释')
for(const dispose of disposers.reverse())if(typeof dispose==='function')await dispose()
await fakeCtx.conversation.sendSession({sessionId:'s1'},'停用后正常发送',[],'queue')
check('disposal restores the native sending method',sent.at(-1)[1]==='停用后正常发送')
const failed=results.filter(r=>!r.ok)
console.log(`\n${results.length-failed.length}/${results.length} submission checks passed`)
root.unmount();if(failed.length)process.exitCode=1

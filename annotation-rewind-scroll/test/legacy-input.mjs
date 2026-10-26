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
let phase = 'plain', revision = 1
const migrationWrites = []
let snapshot = {text:'开头\u200B /file.md\u200B 保留\u200B用户原文',references:[
 {source:'annotation',ref:'s1',offset:2,length:1,label:' ',clipboardText:'\u200B'},
 {source:'file',ref:'/file.md',offset:4,length:8,label:'file.md',clipboardText:'/file.md'},
 {source:'annotation',ref:'s1#2',offset:12,length:1,label:' ',clipboardText:'\u200B'},
]}
const original = structuredClone(snapshot)
const fakeInput = {
 state:{getSnapshot:()=>({phase})},get draftSnapshot(){return snapshot},
 setDraft(next){snapshot=structuredClone(next);migrationWrites.push(snapshot);revision++;renderDock()},
 insertReference(reference,span){inserted.push({reference,span});return true},
}
localStorage.setItem('dsh.annotation.v1',JSON.stringify({v:2,rows:[{id:'legacy-note',sessionId:'s1',kind:'message',quote:'旧引用',comment:'保留待发送注释',status:'pending',createdAt:1}]}))
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

const root=createRoot(document.getElementById('root')),Dock=registered.slots.get('conversation.input.left#annotation').component
function renderDock(){root.render(h(Dock,{sessionId:'s1',useInput:selector=>selector({draft:snapshot.text,draftRev:revision}),inputActions:{setDraft:fakeInput.setDraft},t:translate}))}
renderDock();await tick(100)
check('legacy annotation references are removed from semantic draft',!snapshot.references.some(r=>r.source==='annotation'))
check('only owned zero-width characters are removed',snapshot.text==='开头 /file.md 保留\u200B用户原文',snapshot.text)
check('file reference identity and its adjusted offset are preserved',snapshot.references.length===1&&snapshot.references[0].source==='file'&&snapshot.references[0].offset===3&&snapshot.text.slice(3,11)==='/file.md',snapshot.references)
check('migration preserves the pending annotation record',api.items().length===1&&api.items()[0].comment==='保留待发送注释')
const count=migrationWrites.length
snapshot.text+='继续输入';revision++;renderDock();await tick(80)
check('typing after migration does not rewrite the draft again',migrationWrites.length===count&&inserted.length===0)
phase='claimed';snapshot=structuredClone(original);revision++;renderDock();await tick(80)
check('active slash commands are not rewritten by migration',migrationWrites.length===count&&snapshot.references.length===3)
const failed=results.filter(r=>!r.ok);console.log(`\n${results.length-failed.length}/${results.length} migration checks passed`)
root.unmount();if(failed.length)process.exitCode=1

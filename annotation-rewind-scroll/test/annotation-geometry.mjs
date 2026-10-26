/** 使用生产客户端与真实浏览器布局复现滚动角标及底部列表编辑。 */
import {createRequire} from 'node:module'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {dirname,join} from 'node:path'
const require=createRequire('/Users/liuming.liu/My/codespace/github/deepseek-harness/packages/client/ui-chat/package.json')
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/Users/liuming.liu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs')
const output=process.env.DSH_GEOMETRY_OUTPUT || '/tmp/dsh-annotation-geometry'
mkdirSync(output,{recursive:true})
const client=readFileSync(process.env.DSH_CLIENT_FILE || new URL('../client.js',import.meta.url),'utf8')
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || '/Users/liuming.liu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
const results=[],errors=[]
const check=(name,ok,detail)=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}${ok?'':' '+JSON.stringify(detail)}`)}
page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message)})
page.setDefaultTimeout(8000)
await page.route('http://geometry.test/**',async route=>{
 const path=new URL(route.request().url()).pathname
 if(path==='/client.js')return route.fulfill({contentType:'application/javascript',body:client})
 if(path==='/react.js'||path==='/react-dom.js'){
  const name=path==='/react.js'?'react':'react-dom'
  return route.fulfill({contentType:'application/javascript',body:readFileSync(join(dirname(require.resolve(name+'/package.json')),'umd',name+'.development.js'),'utf8')})
 }
 return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><style>
 body{margin:0;font:14px/24px system-ui;background:#fff;color:#171717}header{height:100px;background:#f6f7f8;position:relative;z-index:10;padding-left:240px}main{position:absolute;top:100px;left:220px;width:1020px;height:800px;overflow:hidden}[data-conversation-scroll]{height:100%;overflow:auto;position:relative}.content{height:2400px;position:relative;padding:0 50px;box-sizing:border-box}#quote{position:absolute;top:850px;width:600px;margin:0}[data-composer-card]{position:sticky;bottom:0;z-index:7;background:white;border:1px solid #ddd;border-radius:16px;padding:16px;margin:0 30px;box-sizing:border-box;height:120px}#dock{margin-top:12px;height:28px}aside{position:absolute;right:0;top:100px;width:180px;bottom:0;background:#f6f7f8}.doc{position:relative;overflow:auto;height:190px;margin-top:150px}.doc-body{width:1300px;height:600px;padding:20px;box-sizing:border-box}#doc-quote{margin:0;width:600px}
 </style></head><body><header>Harness header</header><main><div data-conversation-scroll><article class="content" data-chat-node-key="assistant:3" data-chat-turn="3" data-chat-flow-kind="assistant-step"><p id="quote">这是一段用于检验滚动跟随的回答正文，注释角标应当始终跟随选区并受聊天区边界限制。</p></article><footer data-composer-card><div data-composer-input contenteditable="true">测试草稿</div><div id="dock"></div></footer></div></main><aside>Document pane</aside><script src="/react.js"></script><script src="/react-dom.js"></script><script>
 const slots=new Map(),dict={},sources=[];let version=0;const subscribers=new Set();let draft='测试草稿';
 const t=(key,params={})=>Object.entries(params).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',String(v)),dict[key]||key);
 window.__ModuleLoader__={load(reg){window.plugin=reg.factory(name=>name==='react'?React:ReactDOM)}};
 window.ctx={effect(fn){const dispose=fn();(this.disposers||=[]).push(dispose);return dispose},locale:{register(ns,lang,d){if(lang==='zh')Object.assign(dict,d);return()=>{}},bind:()=>t},sessions:{scope:()=>({})},conversation:{sendSession:async()=>({kind:'success'}),input:{for:()=>({insertReference(){return true}})}},inputTriggers:{registerSource(s){sources.push(s);return()=>{}}},slots:{inject(k,fn){return fn()},register(o,component){slots.set(o.name+'#'+(o.id||''),component);return()=>{}}}};
 window.start=()=>{plugin.apply(ctx);const Dock=slots.get('conversation.input.left#annotation');const actions={setDraft(text){draft=text;version++;subscribers.forEach(fn=>fn())}};const useInput=selector=>{React.useSyncExternalStore(fn=>{subscribers.add(fn);return()=>subscribers.delete(fn)},()=>version);return selector({draft,draftRev:version})};window.root=ReactDOM.createRoot(document.getElementById('dock'));root.render(React.createElement(Dock,{sessionId:'geometry',useInput,inputActions:actions,t}));document.querySelector('[data-conversation-scroll]').scrollTop=650};
 </script><script src="/client.js"></script><script>start()</script></body></html>`})
})
try{
 await page.goto('http://geometry.test');await page.waitForLoadState('networkidle')
 await page.evaluate(()=>{const node=document.querySelector('#quote').firstChild;const r=document.createRange();r.setStart(node,0);r.setEnd(node,23);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))})
 await page.getByRole('button',{name:'添加注释',exact:true}).click()
 await page.locator('.dsa-note__area').fill('滚动测试评论')
 await page.getByRole('button',{name:'保存注释',exact:true}).click()
 await page.locator('.dsa-marker').waitFor()
 await page.waitForTimeout(220)
 const samples=await page.evaluate(async()=>{
  const scroll=document.querySelector('[data-conversation-scroll]'),marker=document.querySelector('.dsa-marker'),range=[...CSS.highlights.get('dsh-annotation')][0],rows=[]
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve))
  for(let i=0;i<10;i++){scroll.scrollTop+=7;await frame();await frame();const m=marker.getBoundingClientRect(),r=range.getClientRects();const q=r[r.length-1];rows.push({dy:m.top-(q.top-8),dx:m.left-(q.right+3)})}
  return rows
 })
 check('badge follows continuous scrolling within two frames',samples.every(s=>Math.abs(s.dy)<2&&Math.abs(s.dx)<2),samples)
 const getState=()=>page.evaluate(()=>{
  const s=document.querySelector('[data-conversation-scroll]').getBoundingClientRect(),m=document.querySelector('.dsa-marker'),b=m?.getBoundingClientRect();
  return {visible:!!m&&getComputedStyle(m).visibility!=='hidden'&&b.width>0,marker:b?.toJSON(),scroll:s.toJSON()}
 })
 await page.evaluate(()=>{const s=document.querySelector('[data-conversation-scroll]'),r=[...CSS.highlights.get('dsh-annotation')][0].getBoundingClientRect();s.scrollTop+=r.bottom-s.getBoundingClientRect().top+80})
 await page.waitForTimeout(220)
 const above=await getState();check('badge disappears when source scrolls above chat header',!above.visible,above)
 await page.screenshot({path:join(output,'above-chat.png')})
 await page.evaluate(()=>document.querySelector('[data-conversation-scroll]').scrollTop=0)
 await page.waitForTimeout(220)
 const below=await getState();check('badge disappears when source scrolls below composer',!below.visible,below)
 await page.screenshot({path:join(output,'below-chat.png')})
 await page.evaluate(()=>document.querySelector('[data-conversation-scroll]').scrollTop=1250)
 await page.waitForTimeout(220)
 await page.locator('[data-dsh-annotation-chip]').hover();await page.locator('.dsa-pop').waitFor()
 const list=await page.locator('.dsa-pop').boundingBox()
 await page.getByRole('button',{name:'编辑注释',exact:true}).click()
 const note=await page.locator('.dsa-note--edit').boundingBox()
 const distance=Math.max(list.x-note.x-note.width,note.x-list.x-list.width,list.y-note.y-note.height,note.y-list.y-list.height,0)
 check('editing from pending list opens beside the list',distance<=16&&note.y>=list.y-100,{note,list,distance})
 check('pending list remains open while editing its annotation',await page.locator('.dsa-pop').count()===1)
 await page.screenshot({path:join(output,'edit-by-list.png')})
 await page.locator('.dsa-note__area').fill('修改后的滚动测试评论')
 await page.getByRole('button',{name:'保存',exact:true}).click()
 check('editing from the list saves the existing annotation',await page.evaluate(()=>__dshAnnotation.items().length===1&&__dshAnnotation.items()[0].comment==='修改后的滚动测试评论'))
 await page.getByRole('button',{name:'编辑注释',exact:true}).click()
 await page.setViewportSize({width:800,height:1000});await page.waitForTimeout(80)
 const narrowNote=await page.locator('.dsa-note--edit').boundingBox(),narrowList=await page.locator('.dsa-pop').boundingBox()
 check('narrow viewport keeps list editing nearby and fully visible',narrowNote.x>=0&&narrowNote.x+narrowNote.width<=800&&narrowNote.y>=0&&narrowNote.y+narrowNote.height<=1000&&Math.abs(narrowNote.y+narrowNote.height+8-narrowList.y)<2,{narrowNote,narrowList})
 await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(60)
 await page.getByRole('button',{name:'取消',exact:true}).click()
 await page.mouse.click(10,400)
 await page.evaluate(()=>document.querySelector('[data-conversation-scroll]').scrollTop=650)
 await page.waitForTimeout(220)
 await page.locator('.dsa-marker').click()
 const atSource=await page.locator('.dsa-note--edit').boundingBox()
 const quote=await page.locator('#quote').boundingBox()
 check('clicking a badge still opens editing beside its source',Math.abs(atSource.y-quote.y)<220,{atSource,quote})
 await page.getByRole('button',{name:'取消',exact:true}).click()
 await page.evaluate(()=>{
  const aside=document.querySelector('aside');aside.style.width='500px';aside.innerHTML='<div class="doc"><div class="doc-body" data-document-markdown><p id="doc-quote">文档注释也需要跟随侧栏的纵向和横向滚动，不能覆盖其他面板。</p></div></div>'
  const node=document.querySelector('#doc-quote').firstChild,r=document.createRange();r.setStart(node,0);r.setEnd(node,12);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))
 })
 await page.getByRole('button',{name:'添加注释',exact:true}).click()
 await page.locator('.dsa-note__area').fill('文档裁剪测试')
 await page.getByRole('button',{name:'保存注释',exact:true}).click()
 await page.waitForTimeout(100)
 // Resolve by the actual record/comment so localized accessible names can evolve.
 const docBadge=page.locator('.dsa-marker[title="文档裁剪测试"]')
 check('document annotation badge is initially visible',await docBadge.evaluate(el=>getComputedStyle(el).visibility==='visible'))
 await page.evaluate(()=>document.querySelector('.doc').scrollLeft=400)
 await page.waitForTimeout(60)
 check('document badge is clipped on horizontal pane scrolling',await docBadge.evaluate(el=>getComputedStyle(el).visibility==='hidden'))
 await page.evaluate(()=>{const el=document.querySelector('.doc');el.scrollLeft=0;el.scrollTop=120})
 await page.waitForTimeout(60)
 check('document badge is clipped on vertical pane scrolling',await docBadge.evaluate(el=>getComputedStyle(el).visibility==='hidden'))
 await page.evaluate(()=>document.querySelector('.doc').scrollTop=0)
 await page.waitForTimeout(60)
 check('document badge returns when its source is visible again',await docBadge.evaluate(el=>getComputedStyle(el).visibility==='visible'))
 await page.locator('[data-dsh-annotation-chip]').hover();await page.locator('.dsa-pop').waitFor()
 await page.getByRole('button',{name:'编辑注释',exact:true}).first().click()
 await page.getByRole('button',{name:'清空全部',exact:true}).click()
 check('clear-all also closes an active list editor',await page.locator('.dsa-note').count()===0&&await page.locator('.dsa-pop').count()===0&&await page.locator('.dsa-marker').count()===0)
 check('browser has no runtime errors',errors.length===0,errors)
}catch(error){await page.screenshot({path:join(output,'failure.png')});console.log('STATE',await page.evaluate(()=>({text:document.body.innerText.slice(-600),trace:window.__dshAnnotation?.lastGesture?.()})));throw error}finally{
 writeFileSync(join(output,'results.json'),JSON.stringify({results,errors},null,2));await browser.close()
}
console.log(results.filter(r=>r.ok).length+'/'+results.length+' geometry checks passed')
if(results.some(r=>!r.ok))process.exitCode=1

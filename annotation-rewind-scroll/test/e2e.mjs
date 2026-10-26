import assert from 'node:assert/strict'
import {writeFileSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
const output=process.env.DSH_TEST_OUTPUT || '/tmp/dsh-annotation-rewind-scroll-e2e'
mkdirSync(output,{recursive:true})
import {openHarness} from './browser-helper.mjs'
const {browser,page}=await openHarness()
const checks=[],errors=[]
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name)}
page.on('pageerror',error=>errors.push(error.message))
const id=process.env.DSH_SESSION_ID || 'session-a0b1a3a6-26e8-4de9-ba5f-10ce73bd890e'
const title=process.env.DSH_SESSION_TITLE || 'DeepSeek Harness 注释功能设计'
const documentPath=process.env.DSH_DOCUMENT_PATH || 'research/dsh-annotation-design.md'
const documentTitle=process.env.DSH_DOCUMENT_TITLE || 'DSH 注释能力设计方案'
try{
 await page.getByText(title,{exact:true}).first().click()
 await page.locator('[data-composer-input]').waitFor()
 await page.waitForFunction(()=>window.__dshAuditCtx&&document.querySelector('.dsa-edit'))
 const initial=await page.evaluate(async id=>{
  const ctx=window.__dshAuditCtx,input=ctx.conversation.input.for(ctx.sessions.scope(id))
  window.__audit={ctx,input,original:structuredClone(input.draftSnapshot),locale:ctx.locale.getSnapshot().active,theme:ctx.get('theme').getTheme().preference}
  const list=await ctx.get('remote.pluginManager').listBundles()
  const bundle=list.value.find(row=>row.name==='dsh-annotation-rewind-scroll')
  ctx.locale.setLocale('zh');ctx.get('theme').setTheme('light')
  return {enabled:bundle?.enabled,meta:{title:bundle?.meta?.title,description:bundle?.meta?.description},history:(await ctx.get('remote.annotationHistory').listMessages(id)).value.items.length}
 },id)
 console.log('PLUGIN',JSON.stringify({enabled:initial.enabled,meta:initial.meta}))
 check('renamed plugin is active with localized metadata',initial.enabled)
 await page.evaluate(()=>window.__audit.input.setDraft('请结合以下注释完善回答。'))
 await page.waitForTimeout(250)
 const response=page.locator('[data-chat-flow-kind="assistant-step"]').last()
 await response.scrollIntoViewIfNeeded()
 const select=async(selector)=>page.evaluate(selector=>{
  const root=document.querySelector(selector)
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT)
  let node
  while(node=walker.nextNode())if(node.textContent.trim().length>24&&!node.parentElement.closest('button,[data-dsh-annotation-ui]')&&node.parentElement.getBoundingClientRect().height>0)break
  if(!node)throw new Error('No selectable prose')
  const range=document.createRange();range.setStart(node,0);range.setEnd(node,Math.min(node.textContent.length,36))
  const selection=getSelection();selection.removeAllRanges();selection.addRange(range)
  document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))
  return selection.toString()
 },selector)
 // Scope the selected response by a test-only marker; actual content stays untouched.
 await response.evaluate(el=>el.setAttribute('data-audit-response',''))
 const selected=await select('[data-audit-response]')
 await page.getByRole('button',{name:'添加注释',exact:true}).waitFor()
 check('selection action keeps native selection for copying',await page.evaluate(()=>getSelection().toString())===selected)
 await page.context().grantPermissions(['clipboard-read','clipboard-write'])
 await page.keyboard.press('Meta+c')
 const copied=await page.evaluate(()=>navigator.clipboard.readText())
 check('ordinary text copying still works',copied===selected)
 await page.getByRole('button',{name:'添加注释',exact:true}).click()
 await page.waitForFunction(()=>CSS.highlights.get('dsh-annotation-pending')?.size>0)
 check('pending selection highlight is visible while annotating',await page.evaluate(()=>CSS.highlights.get('dsh-annotation-pending')?.size>0))
 await page.locator('.dsa-note__area').fill('请补充一个具体例子，并说明适用条件。')
 await page.screenshot({path:join(output,'note-zh-light.png')})
 await page.getByRole('button',{name:'保存注释',exact:true}).click()
 await page.locator('[data-dsh-annotation-chip]').waitFor()
 await page.waitForFunction(()=>!CSS.highlights.get('dsh-annotation-pending')?.size&&CSS.highlights.get('dsh-annotation')?.size===1)
 check('save clears temporary highlight and retains the saved highlight',await page.evaluate(()=>!CSS.highlights.get('dsh-annotation-pending')?.size&&CSS.highlights.get('dsh-annotation')?.size===1))
 const placement=await page.evaluate(()=>{
  const chip=document.querySelector('[data-dsh-annotation-chip]').getBoundingClientRect(),card=document.querySelector('[data-composer-card]').getBoundingClientRect(),input=document.querySelector('[data-composer-input]').getBoundingClientRect()
  return chip.left>=card.left&&chip.right<=card.right&&chip.bottom<=card.bottom&&chip.top>=input.bottom
 })
 check('count remains inside the bottom composer toolbar',placement)
 await page.locator('[data-dsh-annotation-chip]').click()
 await page.locator('.dsa-pop').waitFor({state:'visible'})
 await page.mouse.move(20,20)
 await page.screenshot({path:join(output,'list-zh-light.png')})
 const bounds=await page.locator('.dsa-pop').boundingBox()
 check('annotation list stays within the viewport',bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=1440&&bounds.y+bounds.height<=1000)
 await page.evaluate(()=>{window.__audit.ctx.locale.setLocale('en');window.__audit.ctx.get('theme').setTheme('dark')})
 await page.getByRole('button',{name:'Clear all',exact:true}).waitFor()
 await page.screenshot({path:join(output,'list-en-dark.png')})
 check('English controls do not display untranslated keys',!(await page.locator('.dsa-pop').innerText()).match(/dock\.|note\.|row\.|time\.|刚刚|清空/))

 const serialized=await page.evaluate(id=>window.__dshAnnotation.probe(id),id)
 check('model appendix has fully English metadata',serialized.includes('Regarding:')&&serialized.includes('Quote:')&&serialized.includes('Annotation:')&&!serialized.includes('针对：'))
 await page.getByRole('button',{name:'Clear all',exact:true}).click()
 await page.waitForTimeout(150)
 check('clear-all removes marks, list and pending records',await page.evaluate(()=>window.__dshAnnotation.items().length===0&&!document.querySelector('.dsa-marker')&&!document.querySelector('.dsa-pop')))
 // Native document preview, opened via the host's own UI service.
 await page.evaluate(({id,path})=>window.__audit.ctx.get('sidebarRight').openResource(`dsh-resource://file/session/${id}/${path.replace(/^\//,'')}`),{id,path:documentPath})
 await page.getByRole('heading',{name:documentTitle,exact:true}).waitFor()
 await page.getByRole('heading',{name:documentTitle,exact:true}).evaluate(el=>el.parentElement.setAttribute('data-audit-document',''))
 await select('[data-audit-document]')
 await page.getByRole('button',{name:'Add annotation',exact:true}).waitFor()
 await page.getByRole('button',{name:'Add annotation',exact:true}).click()
 await page.locator('.dsa-note__area').fill('Explain this design choice.')
 await page.screenshot({path:join(output,'document-en-dark.png')})
 await page.getByRole('button',{name:'Save annotation',exact:true}).click()
 check('actual document preview supports annotation with its path',await page.evaluate(path=>window.__dshAnnotation.items().some(item=>item.kind==='document'&&item.path?.endsWith(path)),documentPath))
 await page.locator('[data-dsh-annotation-chip]').click();await page.getByRole('button',{name:'Clear all',exact:true}).click()
 // The message pencil inherits the same class and row as the native copy action.
 const user=page.locator('[data-chat-flow-kind="user"]').last()
 await user.scrollIntoViewIfNeeded()
 const row=await user.evaluate(node=>{
  const pencil=node.querySelector('.dsa-edit'),copy=[...node.querySelectorAll('[data-clock="start"] button')].find(b=>!b.classList.contains('dsa-edit'))
  const p=pencil.getBoundingClientRect(),c=copy.getBoundingClientRect()
  return {aligned:Math.abs(p.y-c.y)<1&&p.x>c.x,sameSize:Math.abs(p.height-c.height)<1}
 })
 check('pencil follows copy with matching size and alignment',row.aligned&&row.sameSize)
 await user.locator('.dsa-edit').click()
 await page.getByRole('button',{name:'Cancel',exact:true}).waitFor()
 await page.screenshot({path:join(output,'edit-en-dark.png')})
 await page.getByRole('button',{name:'Cancel',exact:true}).click()
 check('inline edit cancels without resubmitting',await page.locator('.dsa-inline-edit').count()===0)
 const composer=page.locator('[data-composer-input][contenteditable="true"]')
 await page.evaluate(()=>window.__audit.input.setDraft('Keep this draft.'))
 await composer.focus();await page.keyboard.press('ArrowUp');await page.waitForTimeout(250)
 check('composer recalls an earlier user input',await page.evaluate(()=>window.__audit.input.state.getSnapshot().draft!=='Keep this draft.'))
 await page.keyboard.press('PageDown');await page.waitForTimeout(250)
 check('composer restores its unsent draft',await page.evaluate(()=>window.__audit.input.state.getSnapshot().draft==='Keep this draft.'))
 await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('PageUp');await page.waitForTimeout(400)
 check('transcript keyboard navigation remains available',await page.locator('[data-dsa-history-current]').count()===1)
 const finalCount=await page.evaluate(async id=>(await window.__audit.ctx.get('remote.annotationHistory').listMessages(id)).value.items.length,id)
 check('original conversation message count is unchanged',finalCount===initial.history)
 check('no browser runtime errors',errors.length===0)
}catch(error){await page.screenshot({path:join(output,'failure.png')});throw error}finally{
 await page.evaluate(()=>{const a=window.__audit;if(a){a.input.setDraft(a.original);a.ctx.locale.setLocale(a.locale);a.ctx.get('theme').setTheme(a.theme)}}).catch(()=>{})
 await page.waitForTimeout(400)
 writeFileSync(join(output,'browser.json'),JSON.stringify({checks,errors},null,2))
 await browser.close()
}

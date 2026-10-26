import {mkdirSync,writeFileSync} from 'node:fs'
import {openHarness} from './browser-helper.mjs'
const {browser,page}=await openHarness(),out=process.env.DSH_INPUT_OUTPUT || '/tmp/dsh-input-browser'
mkdirSync(out,{recursive:true});const checks=[],title=process.env.DSH_SESSION_TITLE || 'Greeting'
const check=(name,ok,details)=>{checks.push({name,ok,details});console.log(ok?'PASS':'FAIL',name,JSON.stringify(details))}
try{
 await page.waitForFunction(()=>window.__dshAuditCtx);await page.getByText(title,{exact:true}).first().click();await page.waitForFunction(()=>window.__dshAuditCtx&&document.querySelector('.dsa-edit'))
 await page.evaluate(title=>{const ctx=window.__dshAuditCtx,id=Object.values(ctx.sessions.list.getSnapshot().byId).find(row=>row.title===title||row.displayTitle===title).id,input=ctx.conversation.input.for(ctx.sessions.scope(id));window.__zeroAudit={ctx,input,id,original:structuredClone(input.draftSnapshot),locale:ctx.locale.getSnapshot().active};ctx.locale.setLocale('zh');input.setDraft('正文开头')},title)
 await page.waitForTimeout(300)
 const response=page.locator('[data-chat-flow-kind="assistant-step"]').last();await response.scrollIntoViewIfNeeded();await response.evaluate(el=>el.setAttribute('data-zero-source',''))
 await page.evaluate(()=>{const root=document.querySelector('[data-zero-source]'),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())if(node.textContent.trim().length>24&&!node.parentElement.closest('button')&&node.parentElement.getBoundingClientRect().height>0)break;const r=document.createRange();r.setStart(node,0);r.setEnd(node,22);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))})
 await page.getByRole('button',{name:'添加注释',exact:true}).click();await page.locator('.dsa-note__area').fill('零宽字符复现');await page.getByRole('button',{name:'保存注释',exact:true}).click()
 await page.waitForTimeout(450)
 const composer=page.locator('[data-composer-input][contenteditable="true"]');await composer.click();await page.keyboard.press('End');await page.keyboard.type('abc');await page.waitForTimeout(400)
 await composer.click();await page.keyboard.press('End');await page.keyboard.type('def');await page.waitForTimeout(400)
 const state=await page.evaluate(()=>{const s=window.__zeroAudit.input.state.getSnapshot();return {zeroWidthCount:[...s.draft].filter(c=>c==='\u200b').length,draftLength:s.draft.length,annotationReferences:s.occurrences.filter(o=>o.source==='annotation').length,visibleText:document.querySelector('[data-composer-input]').textContent.replaceAll('\u200b','<U+200B>')}})
 check('typing after annotating never inserts U+200B',state.zeroWidthCount===0,state)
 check('typing never leaves hidden annotation references in the draft',state.annotationReferences===0,state)
 await page.screenshot({path:out+'/typing.png'})
 const sending=await page.evaluate(async()=>{
  const {ctx,input,id}=window.__zeroAudit,before=input.state.getSnapshot().draft,calls=[]
  let succeed=false
  const face={sessionId:id,beginSubmission(args){return{requestId:'annotation-ui-test',abandon(){}}},async prompt(content,mode,signal){calls.push({content,mode,aborted:signal?.aborted});return succeed?{ok:true,value:{}}:{ok:false,error:{code:'fixture-rejection'}}}}
  const rejected=await ctx.conversation.sendSession(face,before,[],'queue',new AbortController().signal)
  const retained=window.__dshAnnotation.items().length
  succeed=true
  const accepted=await ctx.conversation.sendSession(face,before,[],'steer',new AbortController().signal)
  return {before,rejected:rejected.kind,retained,accepted:accepted.kind,calls,remaining:window.__dshAnnotation.items().length}
 })
 check('actual native sending appends one complete appendix after the body',sending.calls.every(c=>{const text=c.content.find(p=>p.type==='text')?.text||'';return text.startsWith(sending.before)&&text.split('零宽字符复现').length===2&&!text.includes('\u200b')}),sending.calls.map(c=>({mode:c.mode,textParts:c.content.length})))
 check('failed admission keeps annotations for retry',sending.rejected==='error'&&sending.retained===1,{outcome:sending.rejected,pending:sending.retained})
 check('successful admission clears the captured annotations',sending.accepted==='success'&&sending.remaining===0,{outcome:sending.accepted,pending:sending.remaining})
 await page.evaluate(()=>window.__zeroAudit.input.setDraft({text:'保留\u200B /tmp/a.md',references:[{source:'annotation',ref:'old',offset:2,length:1,label:' ',clipboardText:'\u200B'},{source:'file',ref:'/tmp/a.md',offset:4,length:9,label:'a.md',clipboardText:'/tmp/a.md',appearance:'file'}]}))
 await page.waitForTimeout(200)
 const migrated=await page.evaluate(()=>window.__zeroAudit.input.draftSnapshot)
 check('legacy annotation characters are removed without losing file references',migrated.text==='保留 /tmp/a.md'&&migrated.references.length===1&&migrated.references[0].source==='file'&&migrated.references[0].offset===3,migrated)

}catch(error){await page.screenshot({path:out+'/failure.png'});throw error}finally{
 await page.evaluate(()=>{const a=window.__zeroAudit;if(a){a.input.setDraft(a.original);a.ctx.locale.setLocale(a.locale)}}).catch(()=>{})
 writeFileSync(out+'/results.json',JSON.stringify(checks,null,2));await browser.close()
}
if(checks.some(c=>!c.ok))process.exitCode=1

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { HistoryEditor, historyMessages, navigationMessages } from '../host-history.js'
const require = createRequire('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json')
const { Session } = require('@deepseek-ai/dsh-session')
let passed = 0
const test = async (name, run) => { await run(); passed++; console.log('PASS',name) }
function fixture() {
 const session=Session.create(`annotation-test-${Math.random()}`)
 const events=[]
 for(let turn=1;turn<=3;turn++) {
  session.append('turn/start',{turn})
  events.push(session.append('user/message',{id:`u${turn}`,role:'user',source:{kind:'user'},content:[{type:'text',text:`input ${turn}`},...(turn===2?[{type:'image',attachment:{attachmentId:'sha256:'+'a'.repeat(64),mediaType:'image/png',width:1,height:1,bytes:1}}]:[])]},{surfaceOp:'append'}))
  session.append('assistant/message',{turn,step:1,stream:[],message:{id:`a${turn}`,role:'assistant',source:{kind:'model',provider:'test',model:'test'},content:[{type:'text',text:`answer ${turn}`}]}},{surfaceOp:'append'})
  session.append('turn/end',{turn,reason:{kind:'completed'}})
 }
 const inbox={nextTurn:[],nextStep:[]}
 const agent={id:session.id,session,inbox,status:'idle',cancelled:0,
  cancel(){this.cancelled++;this.status='idle';inbox.nextTurn=[];inbox.nextStep=[]},
  whenIdle:async()=>{},runMaintenance:async task=>task(new AbortController().signal),
  followup(message){inbox.nextTurn.push(message)},
 }
 let flushes=0
 const editor=new HistoryEditor({flush:async()=>{flushes++;return true}})
 const request={requestId:'request_edit_0001',messageId:'u2',seq:events[1].seq,text:'edited **raw** text\nnext line'}
 return {session,agent,editor,request,events,flushes:()=>flushes}
}
await test('native surface removes only the selected suffix; audit events remain intact',async()=>{
 const {session,agent,editor,request,events}=fixture();const before=JSON.stringify(session.snapshotEvents())
 const result=await editor.editAndResubmit(agent,request)
 assert.equal(result.ok,true);assert.equal(agent.inbox.nextTurn.length,1)
 assert.deepEqual(session.deriveMessages().filter(m=>m.content.length).map(m=>m.content[0]?.text),['input 1','answer 1'])
 assert.equal(JSON.stringify(session.snapshotEvents().slice(0,JSON.parse(before).length)),before)
 assert.equal(session.snapshotEvents()[events[1].seq].data.content[0].text,'input 2')
 assert.equal(agent.inbox.nextTurn[0].content[0].text,request.text)
 assert.deepEqual(agent.inbox.nextTurn[0].content[1],events[1].data.content[1])
})
await test('native empty user checkpoint replays the cut without extra text',async()=>{
 const {session,agent,editor,request}=fixture();await editor.editAndResubmit(agent,request)
 const restored=Session.create(session.id,session.snapshotEvents())
 assert.deepEqual(restored.deriveMessages().filter(m=>m.content.length).map(m=>m.content[0]?.text),['input 1','answer 1'])
 restored.append('user/message',agent.inbox.nextTurn[0],{surfaceOp:'append'})
 assert.deepEqual(restored.deriveMessages().filter(m=>m.content.length).map(m=>m.content[0]?.text),['input 1','answer 1',request.text])
})
await test('concurrent duplicate submissions queue exactly one message',async()=>{
 const f=fixture();await Promise.all([f.editor.editAndResubmit(f.agent,f.request),f.editor.editAndResubmit(f.agent,f.request)])
 assert.equal(f.agent.inbox.nextTurn.length,1);assert.equal(f.session.snapshotEvents().filter(e=>e.type==='user/message'&&e.data.source.kind==='annotation-history-edit').length,1)
})
await test('restart retry is idempotent once edited message was admitted',async()=>{
 const f=fixture();await f.editor.editAndResubmit(f.agent,f.request)
 f.session.append('user/message',f.agent.inbox.nextTurn[0],{surfaceOp:'append'});f.agent.inbox.nextTurn=[]
 const editor=new HistoryEditor({flush:async()=>true});const result=await editor.editAndResubmit(f.agent,f.request)
 assert.equal(result.duplicate,true);assert.equal(f.agent.inbox.nextTurn.length,0)
})
await test('stale and nonhuman targets never cancel a running agent or mutate history',async()=>{
 const f=fixture();const n=f.session.seq
 await assert.rejects(f.editor.editAndResubmit(f.agent,{...f.request,messageId:'not-same'}))
 assert.equal(f.session.seq,n);assert.equal(f.agent.cancelled,0)
 await f.editor.editAndResubmit(f.agent,f.request)
 await assert.rejects(f.editor.editAndResubmit(f.agent,{...f.request,requestId:'request_edit_0002'}),/编辑、回退或压缩/)
})
await test('request id cannot be reused with a different payload',async()=>{
 const f=fixture();await f.editor.editAndResubmit(f.agent,f.request)
 await assert.rejects(f.editor.editAndResubmit(f.agent,{...f.request,text:'different'}),/请求标识/)
})
await test('history lists only model-visible human messages in chronological order',async()=>{
 const f=fixture();assert.deepEqual(historyMessages(f.session).map(i=>i.messageId),['u1','u2','u3'])
 await f.editor.editAndResubmit(f.agent,f.request);assert.deepEqual(historyMessages(f.session).map(i=>i.messageId),['u1']);assert.deepEqual(navigationMessages(f.session).map(i=>i.messageId),['u1'])
})
await test('missing durability and cancelled requests leave the original surface unchanged',async()=>{
 const f=fixture(),n=f.session.seq
 await assert.rejects(new HistoryEditor({flush:async()=>false}).editAndResubmit(f.agent,f.request),/持久化/)
 const control=new AbortController();control.abort()
 await assert.rejects(f.editor.editAndResubmit(f.agent,f.request,control.signal),/取消/)
 assert.equal(f.session.seq,n);assert.equal(f.agent.cancelled,0)
})
await test('persistence failure cancels queued input; retry recovers the same recorded message',async()=>{
 const f=fixture();let calls=0
 const editor=new HistoryEditor({flush:async()=>{if(++calls===2)throw new Error('disk');return true}})
 await assert.rejects(editor.editAndResubmit(f.agent,f.request),/保存编辑失败/)
 assert.equal(f.agent.inbox.nextTurn.length,0)
 await editor.editAndResubmit(f.agent,f.request)
 assert.equal(f.agent.inbox.nextTurn.length,1);assert.equal(f.session.snapshotEvents().filter(e=>e.type==='user/message'&&e.data.source.kind==='annotation-history-edit').length,1)
})
await test('edit rejects unexpected client content instead of trusting attachments from the browser',async()=>{
 const f=fixture();await assert.rejects(async()=>f.editor.editAndResubmit(f.agent,{...f.request,content:[]}),/字段/)
 assert.equal(f.agent.cancelled,0)
})
console.log(`${passed}/${passed} host checks passed`)

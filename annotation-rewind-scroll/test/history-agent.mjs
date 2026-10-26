/** 原生 Agent + 原生持久化 + 本地模型替身；不调用任何真实模型或现有会话。 */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {HistoryEditor,prepareEditedHistory} from '../host-history.js'
const require=createRequire('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json')
const {Context}=require('@deepseek-ai/cordis')
const {LlmAdapter,createUserMessage}=require('@deepseek-ai/dsh-llm')
const {Session}=require('@deepseek-ai/dsh-session')
const root=await mkdtemp(join(tmpdir(),'dsh-native-history-'))
class Adapter extends LlmAdapter {
 requests=[]
 resolveModel(provider,model){return Promise.resolve({provider,id:model,name:model})}
 async *stream(options){
  this.requests.push(options)
  const call=this.requests.length
  yield {type:'block-start',index:0,blockType:'text'}
  if(call===3){
   yield {type:'text-delta',index:0,text:'obsolete partial'}
   await new Promise((_,reject)=>{const stop=()=>reject(new Error('cancelled test stream'));if(options.signal.aborted)stop();else options.signal.addEventListener('abort',stop,{once:true})})
   return
  }
  const text=`response ${call}`
  yield {type:'text-delta',index:0,text}
  yield {type:'block-end',index:0,block:{type:'text',text}}
  yield {type:'usage',usage:{inputTokens:10,outputTokens:10}}
  yield {type:'finish',reason:{kind:'stop'}}
 }
}
const adapter=new Adapter(),ctx=new Context()
const plugin=name=>require(`@deepseek-ai/${name}`).default
try{
 for(const name of ['dsh-llm','dsh-session','dsh-session-projection','dsh-system-prompt','dsh-tools','dsh-agent'])await ctx.plugin(plugin(name))
 await ctx.plugin(require('@deepseek-ai/dsh-session-persistence-jsonl'),{root})
 await ctx.plugin(plugin('dsh-agent-loop'),{agents:[]})
 ctx.llm.registerAdapter(['mock'],adapter)
 ctx.on('agent/request',(payload,next)=>{prepareEditedHistory(payload);return next()})
 const {agent}=await ctx.agents.create({sessionId:'native-history-test',meta:{cwd:root},agentOptions:{provider:'mock',model:'mock'}})
 const send=text=>agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}))
 send('keep input');await agent.whenIdle()
 send('replace input');await agent.whenIdle()
 const target=agent.session.snapshotEvents().find(e=>e.type==='user/message'&&e.data.content[0]?.text==='replace input')
 send('discard input')
 for(let i=0;i<100&&adapter.requests.length<3;i++)await new Promise(r=>setTimeout(r,5))
 assert.equal(adapter.requests.length,3);assert.equal(agent.status,'running')
 const editor=new HistoryEditor({flush:s=>ctx.sessions.flush(s)})
 const request={requestId:'native_agent_edit_001',messageId:target.data.id,seq:target.seq,text:'edited input'}
 const result=await editor.editAndResubmit(agent,request)
 assert.equal(result.ok,true)
 await agent.whenIdle()
 assert.equal(adapter.requests[2].signal.aborted,true)
 assert.equal(adapter.requests.length,4)
 console.log('PASS native cancellation settles before the replacement turn runs')
 const texts=adapter.requests[3].messages.flatMap(m=>m.content.filter(c=>c.type==='text').map(c=>c.text))
 assert(texts.includes('keep input'));assert(texts.includes('edited input'))
 assert(!texts.includes('replace input'));assert(!texts.includes('discard input'));assert(!texts.includes('response 2'));assert(!texts.includes('obsolete partial'))
 assert(!adapter.requests[3].messages.some(m=>m.source?.kind==='annotation-history-edit'))
 console.log('PASS actual model request contains only the retained prefix and edited input text')
 const deepseek=require('@deepseek-ai/dsh-llm-deepseek')
 const connection=deepseek.resolveAdapterOptions({baseURL:'http://127.0.0.1:1',thinking:'disabled',models:[{id:'mock',name:'mock'}]})
 const transport=new deepseek.DeepSeekAdapter({options:()=>connection,resolveAuth:async()=>({headers:{}}),resolveUserId:()=> 'test',prepareExtensions:async()=>({fields:{},accept:async()=>{}})})
 const previousFetch=globalThis.fetch
 let wire
 globalThis.fetch=async (_url,options)=>{wire=JSON.parse(options.body);throw new Error('test captured request without network')}
 try{for await(const ignored of transport.stream(adapter.requests[3])){}}catch{}finally{globalThis.fetch=previousFetch}
 assert(wire,'native DeepSeek transport must reach serialization')
 assert(wire.messages.every(message=>message.content.length>0))
 const wireText=wire.messages.flatMap(message=>message.content.filter(c=>c.type==='text').map(c=>c.text))
 assert(wireText.includes('keep input'));assert(wireText.includes('edited input'));assert(!wireText.includes('replace input'))
 console.log('PASS actual DeepSeek wire serialization omits the empty checkpoint entirely')
 await ctx.sessions.flush(agent.session)
 const handle=await ctx.sessionPersistence.open(agent.id,'read')
 let stored
 try{stored=(await handle.read()).events}finally{await handle.close()}
 const replay=Session.create(agent.id,stored)
 assert(replay.deriveMessages().some(m=>m.content.some(c=>c.type==='text'&&c.text==='edited input')))
 assert(!replay.deriveMessages().some(m=>m.content.some(c=>c.type==='text'&&c.text==='replace input')))
 assert(stored.some(e=>e.type==='user/message'&&e.data.content.some(c=>c.type==='text'&&c.text==='replace input')))
 console.log('PASS native durable JSONL replays the edited surface while retaining its audit history')
 await editor.editAndResubmit(agent,request);await agent.whenIdle()
 assert.equal(adapter.requests.length,4)
 console.log('PASS duplicate request does not run the model a second time')
 console.log('5/5 native agent checks passed')
}finally{await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})}

import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {apply} from '../index.js'
const require=createRequire('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json')
const {Context}=require('@deepseek-ai/cordis')
const Typert=require('@deepseek-ai/dsh-typert-registry').default
const {TypertGatewayService}=require('@deepseek-ai/dsh-api-gateway')
const {Session}=require('@deepseek-ai/dsh-session')
const ctx=new Context()
new Typert(ctx)
const session=Session.create('gateway-test')
session.append('turn/start',{turn:1})
const original=session.append('user/message',{id:'source-user',role:'user',source:{kind:'user'},content:[{type:'text',text:'original'}]},{surfaceOp:'append'})
session.append('turn/end',{turn:1,reason:{kind:'completed'}})
const agent={id:session.id,session,inbox:{nextTurn:[],nextStep:[]},cancel(){},whenIdle:async()=>{},runMaintenance:async task=>task(new AbortController().signal),followup(message){this.inbox.nextTurn.push(message)}}
ctx.provide('loader',{import:async spec=>require(spec)})
ctx.provide('agents',{get:id=>id===agent.id?agent:undefined})
ctx.provide('sessions',{flush:async()=>true})
ctx.typert.resources.register('session',{field:'sessionId'})
ctx.typert.lookups.register('agent',{parameter:'agent',wire:'agentId',resource:'session',hostTypeSymbol:'@deepseek-ai/dsh-agent#Agent',wireTypeSymbol:'@deepseek-ai/dsh-session/types#SessionId',resolve:id=>id===agent.id?agent:undefined})
let deny=false,checks=[]
ctx.provide('remoteAccess',{decide(request){checks.push(request);return deny?{kind:'deny',reason:'test'}:{kind:'allow'}}})
await apply(ctx)
const gateway=new TypertGatewayService(ctx,{websocketHeartbeatIntervalMs:30000,streamInboxBytes:1000000})
const peer={id:'peer-test',ctx,principal:{kind:'test-viewer'},signal:new AbortController().signal}
const call=(method,args)=>gateway.invoke({namespace:'annotationHistory',method,args,peer})
const list=await call('listMessages',{agentId:agent.id})
assert.equal(list.items[0].messageId,'source-user')
assert.equal(checks.at(-1).resources[0].kind,'session')
assert.equal(checks.at(-1).resources[0].id,agent.id)
console.log('PASS strict Gateway resolves the Agent and enforces its Session resource')
await assert.rejects(call('editAndResubmit',{agentId:agent.id,request:{requestId:'request_gateway_001',messageId:'source-user',seq:original.seq,text:'edited',unexpected:true}}))
assert.equal(session.seq,3)
console.log('PASS malformed wire request cannot modify history')
deny=true
await assert.rejects(call('listMessages',{agentId:agent.id}))
deny=false
console.log('PASS access denial happens before history access')
const edited=await call('editAndResubmit',{agentId:agent.id,request:{requestId:'request_gateway_001',messageId:'source-user',seq:original.seq,text:'edited'}})
assert.equal(edited.ok,true)
assert.equal(agent.inbox.nextTurn[0].content[0].text,'edited')
assert.equal(agent.inbox.nextTurn[0].source.principal.kind,'test-viewer')
console.log('PASS self-contained edit endpoint works through the real Gateway')
await ctx.fiber.dispose()
console.log('4/4 gateway checks passed')

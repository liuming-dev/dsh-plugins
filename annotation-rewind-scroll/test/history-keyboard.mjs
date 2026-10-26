import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
const require=createRequire('/Users/liuming.liu/My/codespace/github/deepseek-harness/package.json')
const {JSDOM}=require('jsdom')
const dom=new JSDOM('<html><head></head><body><div id="chat"><div data-chat-node-key="13:input-messageu1" data-chat-flow-kind="user" data-chat-turn="1">one</div><div data-chat-node-key="13:input-messageu2" data-chat-flow-kind="user" data-chat-turn="2">two</div><div data-chat-node-key="13:input-messageu3" data-chat-flow-kind="user" data-chat-turn="3">three</div></div><textarea></textarea><div contenteditable="true" id="composer"></div></body></html>',{pretendToBeVisual:true})
const {window}=dom;globalThis.window=window;globalThis.document=window.document;globalThis.Node=window.Node
let factory;window.__ModuleLoader__={load:registration=>factory=registration.factory}
new Function(readFileSync(new URL('../client.history.js',import.meta.url),'utf8'))()
const module=factory()
const calls=[],loads=[];let editing=false,events=[]
window.HTMLElement.prototype.scrollIntoView=function(){calls.push(this.dataset.chatNodeKey)}
const session={eventSource:{getSnapshot:()=>({entries:events}),subscribe:()=>()=>{}},loadThrough:async seq=>{loads.push(seq)}}
const items=[1,2,3].map(n=>({messageId:`u${n}`,seq:n,turn:n}))
const ctx={remote:{$mount:async()=>()=>{}},get:()=>({listMessages:async()=>({ok:true,value:{ok:true,items}})}),sessions:{binding:()=>({session})}}
const history=await module.installHistory(ctx,{repaint(){},sessionId:()=> 'test',isEditing:()=>editing})
const tick=()=>new Promise(r=>setTimeout(r,30))
const key=async(name,target=document.body,extra={})=>{const e=new window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...extra});target.dispatchEvent(e);await tick();return e}
assert.equal((await key('PageUp')).defaultPrevented,true);assert.equal(calls.at(-1),'13:input-messageu3')
assert.equal((await key('ArrowUp')).defaultPrevented,true);assert.equal(calls.at(-1),'13:input-messageu2')
assert.equal((await key('PageDown')).defaultPrevented,true);assert.equal(calls.at(-1),'13:input-messageu3')
console.log('PASS both keyboard groups navigate by user message')
const count=calls.length;await key('ArrowDown');assert.equal(calls.length,count)
await key('PageUp');await key('PageUp');await key('PageUp');const atStart=calls.length;await key('ArrowUp');assert.equal(calls.length,atStart)
console.log('PASS beginning and end do not wrap around')
assert.equal((await key('ArrowUp',document.querySelector('textarea'))).defaultPrevented,false)
assert.equal((await key('PageDown',document.getElementById('composer'))).defaultPrevented,false)
assert.equal((await key('ArrowUp',document.body,{ctrlKey:true})).defaultPrevented,false)
editing=true;assert.equal((await key('PageUp')).defaultPrevented,false);editing=false
console.log('PASS typing, editable surfaces, modifiers and message editor retain native keys')
assert.deepEqual(loads.slice(0,3),[3,2,3])
console.log('PASS old history is loaded through the addressed Session')
events=[{event:{type:'user/message',seq:10,data:{id:'marker',source:{kind:'annotation-history-edit',targetMessageId:'u2',startTurn:2,endTurn:3}}}}]
history.syncVisibility()
assert.equal(document.querySelector('[data-chat-turn="1"]').hasAttribute('data-dsa-withdrawn'),false)
assert.equal(document.querySelector('[data-chat-turn="2"]').hasAttribute('data-dsa-withdrawn'),true)
assert.equal(document.querySelector('[data-chat-turn="3"]').hasAttribute('data-dsa-withdrawn'),true)
console.log('PASS durable edit markers withdraw the old transcript without deleting DOM content')
await history.dispose()
assert.equal(document.querySelectorAll('[data-dsa-withdrawn]').length,0)
assert.equal((await key('PageUp')).defaultPrevented,false)
console.log('PASS plugin disposal removes keyboard hooks and visibility markers')
console.log('6/6 keyboard checks passed')

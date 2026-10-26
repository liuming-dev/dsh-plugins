import {spawnSync} from 'node:child_process'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)),output=mkdtempSync(join(tmpdir(),'dsh-plugin-tests-'))
const suites=['submission','legacy-input','harness','dockkit','codemirror','edit-message','history-host','history-gateway','history-agent','history-keyboard','history-recall','annotation-geometry']
const results=[]
for(const name of suites){
 const result=spawnSync(process.execPath,[join(root,'test',name+'.mjs')],{cwd:root,encoding:'utf8',timeout:60000})
 const logs=(result.stdout||'')+(result.stderr||'')
 writeFileSync(join(output,name+'.log'),logs)
 const summary=(result.stdout||'').trim().split('\n').reverse().find(line=>/\d+\/\d+.*passed/.test(line))
 const ok=result.status===0&&!result.error
 results.push({name,ok,summary,error:result.error?.message})
 console.log(`${ok?'PASS':'FAIL'} ${name}: ${summary||result.error?.message||'no summary'}`)
 if(!ok)process.stderr.write(logs.slice(-4000))
}
writeFileSync(join(output,'results.json'),JSON.stringify(results,null,2))
console.log('Reports:',output)
if(results.some(result=>!result.ok))process.exitCode=1

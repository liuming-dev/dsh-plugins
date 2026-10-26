import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url))
const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'))
assert.equal(manifest.name,'dsh-annotation-rewind-scroll','Unexpected publication name')
assert.notEqual(manifest.private,true,'private:true prevents npm publishing')
assert.equal(manifest.publishConfig?.registry,'https://registry.npmjs.org/')
assert.equal(manifest.publishConfig?.access,'public')
const [pack]=JSON.parse(execFileSync('npm',['pack','--dry-run','--json','--ignore-scripts','--cache=/tmp/dsh-npm-pack-cache'],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024}))
const files=new Set(pack.files.map(file=>file.path))
const required=['package.json','README.md','RELEASING.md','index.js','client.js','client.history.js','history-contract.js','host-history.js','cordis.patch.yml','icon.svg','locale/zh.json','locale/en.json']
for(const file of required)assert(files.has(file),`Missing package file: ${file}`)
for(const file of files){
 assert(required.includes(file)||/^licen[cs]e(?:\.[^.]+)?$/i.test(file),`Unexpected package file: ${file}`)
 const text=readFileSync(new URL('../'+file,import.meta.url),'utf8')
 assert(!/\/Users\/|\/opt\/homebrew|[?&]token=[A-Za-z0-9_-]{16,}/.test(text),`Machine path or authentication URL in package: ${file}`)
}
assert(readFileSync(new URL('../cordis.patch.yml',import.meta.url),'utf8').includes(`name: '${manifest.name}'`))
for(const file of ['client.js','client.history.js','history-contract.js']){
 const text=readFileSync(new URL('../'+file,import.meta.url),'utf8')
 assert(!text.includes('@local/dsh-annotation-rewind-scroll'),`Old package identity in ${file}`)
 assert(text.includes(`'${manifest.name}`),`Missing module identity in ${file}`)
}
for(const entry of ['.','./client','./client.history.js','./icon']){
 const target=manifest.exports[entry]
 assert(typeof target==='string'&&files.has(target.replace(/^\.\//,'')),`Export target not packaged: ${entry}`)
}
console.log(`Package ready: ${pack.name}@${pack.version}, ${files.size} files, ${pack.size} bytes`)
for(const file of files)console.log('  '+file)

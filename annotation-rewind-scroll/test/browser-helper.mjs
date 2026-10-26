const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/Users/liuming.liu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs')
export async function openHarness(){
 if(!process.env.DSH_WEB_URL)throw new Error('Set DSH_WEB_URL to the authenticated local Harness URL')
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || '/Users/liuming.liu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 await page.addInitScript(()=>{
  let facade
  Object.defineProperty(window,'__ModuleLoader__',{configurable:true,get:()=>facade,set(value){
   facade=value
   const wrap=load=>function(reg){
    if(reg.id==='dsh-annotation-rewind-scroll'){
     const f=reg.factory;reg={...reg,factory(require){const plugin=f(require);return {...plugin,apply(ctx){window.__dshAuditCtx=ctx;return plugin.apply(ctx)}}}}
    }
    return load.call(this,reg)
   }
   let load=wrap(value.load)
   Object.defineProperty(value,'load',{configurable:true,get:()=>load,set(next){load=wrap(next)}})
  }})
 })
 page.on('console',m=>{if(m.type()==='log'&&m.text().includes('[annotation] active'))console.log(m.text())})
 const response=await page.goto(process.env.DSH_WEB_URL)
 if(response.status()===401){await browser.close();throw new Error('Local login token expired')}
 await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{})
 return {browser,page}
}

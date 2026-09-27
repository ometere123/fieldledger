import {spawn} from 'node:child_process';
import {platform} from 'node:os';
import {resolve} from 'node:path';
import {cpSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const port=Number(process.env.FIELDLEDGER_E2E_PORT??'3107');
const standaloneRoot='apps/web/.next/standalone';
const standaloneApp=`${standaloneRoot}/apps/web`;
const serverFile=`${standaloneApp}/server.js`;
mkdirSync(`${standaloneApp}/.next`,{recursive:true});
cpSync('apps/web/.next/static',`${standaloneApp}/.next/static`,{recursive:true});
cpSync('apps/web/public',`${standaloneApp}/public`,{recursive:true});
const server=spawn(process.execPath,[resolve(serverFile)],{cwd:standaloneRoot,env:{...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',NODE_OPTIONS:`--require ${resolve('scripts/network-shim.cjs')} ${process.env.NODE_OPTIONS??''}`},stdio:'ignore'});
let browser;
try{
 let ready=false;for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}
 if(!ready)throw Error('Next server did not start');
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(`${m.text()} ${JSON.stringify(m.location())}`)});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle'});
 if(!await page.getByRole('heading',{name:'Overview'}).isVisible())throw Error('Overview missing');
 if(await page.locator('[data-nextjs-dialog]').count())throw Error('Next error overlay');
 await page.getByRole('button',{name:'Operational events'}).click();
 await page.waitForTimeout(500);if(new URL(page.url()).pathname!=='/events')throw Error(`Operational events navigation failed: ${page.url()} | ${errors.join(' | ')}`);
 await page.locator('tbody tr').first().waitFor();
 if(await page.locator('tbody tr').count()!==5)throw Error('Reference table missing');
 await page.locator('tbody tr').first().click();await page.locator('.drawer').waitFor();if(!await page.locator('.drawer').isVisible())throw Error('Event detail missing');
 await page.setViewportSize({width:390,height:844});await page.locator('.drawer-head button').click();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 if(errors.length)throw Error(`Browser errors: ${errors.join(' | ')}`);
 console.log('Browser smoke passed: overview, event register, detail, responsive viewport, no page errors');
}finally{await browser?.close();server.kill()}

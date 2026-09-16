import {promises as fs} from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const root=path.resolve('build/20260915 smoke');await fs.cp('releases/'+(process.argv[2] || '20260915')+'/IVCS-RT-20260915-Windows-x64',root,{recursive:true});
const child=spawn(path.join(root,'runtime/node.exe'),[path.join(root,'server.cjs')],{cwd:root,env:{...process.env,PORT:'33318'},stdio:'ignore',windowsHide:true});
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:33318/api/library')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage();await page.goto('http://127.0.0.1:33318');await page.getByRole('button',{name:'File and help'}).click();await page.locator('#btn-show-help').click();await page.locator('#btn-show-about').click();assert.match(await page.locator('#about-ivcs-rt').innerText(),/20260915/);
 const index=await (await fetch('http://127.0.0.1:33318/api/library')).json();assert.equal(index.patients.length,1);assert.equal(index.patients[0].id,'SYNTHETIC-LB-20260909');
 console.log('PASS compiled Windows 20260915 starts locally, serves About and synthetic library');
 const file='releases/'+(process.argv[2] || '20260915')+'/IVCS-RT-20260915-Windows-x64/release.json',metadata=JSON.parse(await fs.readFile(file,'utf8'));metadata.nativeExecutionTested=true;await fs.writeFile(file,JSON.stringify(metadata,null,2));
}finally{await browser?.close();child.kill();}

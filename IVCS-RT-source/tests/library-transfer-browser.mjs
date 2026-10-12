import {createRequire} from 'node:module';import express from 'express';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {libraryRouter} from '../server/library.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-transfer-'));await fs.cp('build/release-common/data',root,{recursive:true});
const wait=promise=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Transfer test barrier timed out')),10000);promise.then(value=>{clearTimeout(timer);resolve(value);},e=>{clearTimeout(timer);reject(e);});});
let block=false,entered,closed;let notifyEntered,notifyClosed;
const app=express();app.use('/api/library/study/:key',(req,res,next)=>{if(!block)return next();notifyEntered();res.once('close',()=>notifyClosed());});app.use('/api/library',libraryRouter(root));app.use(express.static(path.resolve('dist')));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const browser=await chromium.launch({headless:true,channel:process.env.IVCS_BROWSER_CHANNEL || (process.platform==='win32'?'msedge':undefined)});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.getByText('CTV_Prostate',{exact:true}).first().waitFor({timeout:60000});
 await page.getByRole('button',{name:'Library',exact:true}).click();await page.getByRole('textbox',{name:'Filter patients'}).fill('CT');const study=page.locator('#patient-library').getByRole('button',{name:/^CT/});
 entered=new Promise(r=>notifyEntered=r);closed=new Promise(r=>notifyClosed=r);block=true;await study.click();await wait(entered);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await wait(closed);await page.getByRole('button',{name:'Cancel',exact:true}).waitFor({state:'hidden'});
 assert.ok(await page.getByText('CTV_Prostate',{exact:true}).count(),'cancel must preserve the active case');
 block=false;if(!await page.locator('#patient-library').isVisible())await page.getByRole('button',{name:'Library',exact:true}).click();await study.click();await page.locator('#patient-library').waitFor({state:'hidden'});await page.getByText('CTV_Prostate',{exact:true}).first().waitFor();assert.deepEqual(errors,[]);
 console.log('PASS stalled library read cancellation, disconnected request, active case preservation and successful reopening');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}

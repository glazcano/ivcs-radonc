import {createRequire} from 'node:module';import express from 'express';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {libraryRouter,createLibrary} from '../server/library.mjs';import {enhancedFixture} from './helpers/enhancedFixture';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-4d-browser-')),app=express();app.use('/api/library',libraryRouter(root));app.use(express.static(path.resolve('dist')));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({headless:true,channel:process.env.IVCS_BROWSER_CHANNEL || (process.platform==='win32'?'msedge':undefined)});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const streams:string[]=[];page.on('response',r=>{if(/\/api\/library\/(study|export)\//.test(r.url()) && r.status()===200)streams.push(r.headers()['content-type'] || '');});await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await page.locator('input[accept=".dcm,.zip"]').setInputFiles({name:'synthetic-enhanced.dcm',mimeType:'application/dicom',buffer:Buffer.from(enhancedFixture())});
 const selection=page.getByRole('dialog');await selection.getByText('Enhanced DICOM · volume selection').first().waitFor();assert.equal(await selection.getByRole('checkbox').count(),2);await selection.getByRole('checkbox').nth(0).check();await selection.getByRole('checkbox').nth(1).check();await selection.getByRole('button',{name:'Load selected series',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('header')?.textContent?.includes('[AXIAL MPR]'),{},{timeout:60000});
 const library=createLibrary(root);let index=await library.list();assert.equal(index.patients[0].studies.length,2);assert.ok(index.patients[0].studies.every(s=>s.originals===1 && !s.state));
 await page.getByRole('button',{name:'4D review',exact:true}).click();const review=page.getByRole('dialog',{name:'4D review'});await review.getByLabel('Phase',{exact:true}).locator('option').nth(1).waitFor({state:'attached'});
 await review.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>(document.querySelector('select[aria-label="Phase"]') as HTMLSelectElement)?.value==='1');await review.getByRole('button',{name:'Pause',exact:true}).click();
 await review.getByLabel('Mode',{exact:true}).selectOption('MIP');await review.getByText(/Derived temporal MIP/).waitFor();await review.getByLabel('Mode',{exact:true}).selectOption('AIP');await page.screenshot({path:'build/acquisitions-4d.png'});
 index=await library.list();assert.ok(index.patients[0].studies.every(s=>!s.state),'Cine and MIP/AIP must not autosave');
 await review.getByLabel('Mode',{exact:true}).selectOption('phase');await review.getByLabel('Phase',{exact:true}).selectOption('1');await review.getByRole('button',{name:'Open phase for contouring'}).click();await review.waitFor({state:'hidden'});
 assert.ok((await page.locator('header').innerText()).includes('phase:2'));
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForTimeout(300);index=await library.list();assert.equal(index.patients[0].studies.filter(s=>s.state).length,1);
 await page.reload();await page.waitForFunction(()=>document.querySelector('header')?.textContent?.includes('phase:2'),{},{timeout:30000});assert.deepEqual(errors,[]);assert.ok(streams.length>=3);assert.ok(streams.every(type=>type.includes('application/x-ndjson')));
 console.log('PASS Enhanced volume selection, phase cine, temporal MIP/AIP, phase opening, manual-only persistence and reopen');
}finally{await browser.close();server.close();}

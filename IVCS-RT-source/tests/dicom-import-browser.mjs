import {createRequire} from 'node:module';
import express from 'express';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {libraryRouter,createLibrary} from '../server/library.mjs';import dicomParser from 'dicom-parser';import JSZip from 'jszip';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-import-'));const app=express();app.use('/api/library',libraryRouter(root));app.use(express.static(path.resolve('dist')));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log(m.text().slice(0,500));});await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'Save',exact:true}).waitFor();
 const input=page.locator('input[accept=".dcm,.zip"]');
 await input.setInputFiles('build/compressed-fixtures/4.90.dcm');const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('checkbox').first().check();
 const load=dialog.getByRole('button',{name:'Load selected series'});assert.equal(await load.isEnabled(),false);await dialog.getByRole('checkbox',{name:'I understand the TPS calculation warning.'}).check();await page.screenshot({path:'build/dicom-import-dialog.png'});await load.click();
 await page.waitForFunction(()=>document.body.textContent.includes('SYNTHETIC-LB-20260909') && !document.querySelector('[role="dialog"]'),{},{timeout:60000});
 await page.waitForTimeout(1000);
 let index=await createLibrary(root).list();assert.equal(index.patients.length,1);assert.equal(index.patients[0].studies.length,1);
 let opened=await createLibrary(root).open(index.patients[0].studies[0].key);assert.equal(opened.selected.slices[0].sourceCompressed,true);assert.equal(opened.selected.slices[0].sourceLossy,false);assert.equal(opened.selected.slices[0].rows,256);
 const original=new Uint8Array(await fs.readFile('tests/fixtures/synthetic-ct.dcm')),second=original.slice(),ds=dicomParser.parseDicom(second),el=ds.elements.x0020000e;second[el.dataOffset+ds.string('x0020000e').length-1]=56;
 const zip=new JSZip();zip.file('first.dcm',original);zip.file('second.dcm',second);
 await input.setInputFiles({name:'multiple.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});await dialog.waitFor();assert.equal(await dialog.getByRole('checkbox').count(),2);await dialog.getByRole('checkbox').first().check();await dialog.getByRole('button',{name:'Load selected series'}).click();await dialog.waitFor({state:'hidden'});await page.waitForTimeout(1000);
 index=await createLibrary(root).list();assert.equal(index.patients[0].studies.length,1,'unselected series must not be archived or registered');
 await input.setInputFiles({name:'plain.dcm',mimeType:'application/dicom',buffer:Buffer.from(second)});await page.waitForTimeout(1500);assert.equal(await dialog.count(),0);index=await createLibrary(root).list();assert.equal(index.patients[0].studies.length,2,'single uncompressed series loads immediately');
 assert.deepEqual(errors,[]);await page.screenshot({path:'build/dicom-import-view.png'});console.log('PASS compressed worker import, acknowledgment, full resolution, selected-only ZIP import, immediate plain import; no browser errors');
}finally{await browser.close();server.close();}

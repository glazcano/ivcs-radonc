import {createRequire} from 'node:module';import express from 'express';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import JSZip from 'jszip';import dp from 'dicom-parser';import {libraryRouter} from '../server/library.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-zip-export-'));await fs.cp('build/release-common/data',root,{recursive:true});const app=express();app.use('/api/library',libraryRouter(root));app.use(express.static(path.resolve('dist')));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.body.textContent.includes('CTV_Prostate'),{},{timeout:60000});
 // Current unsaved registration must take precedence over the saved group.
 await page.locator('#btn-open-registration').click();await page.getByRole('spinbutton',{name:'Translation X (mm)',exact:true}).fill('12');await page.getByRole('button',{name:'Close',exact:true}).click();
 for(const advanced of [false,true]){
  await page.locator('#btn-export-menu').click();await page.locator(advanced?'#btn-export-dicom-zip-advanced':'#btn-export-dicom-zip').click();const dialog=page.getByRole('dialog');await dialog.getByText('Checking archived originals…').waitFor({state:'hidden'});
  if(advanced){await dialog.locator('label').filter({hasText:'SIMULATED T2 MRI'}).locator('input[type=checkbox]').check();await page.screenshot({path:'build/dicom-zip-advanced.png'});}
  await dialog.getByRole('button',{name:'Check before exporting',exact:true}).click();const downloadButton=dialog.locator('#btn-confirm-export-monaco');await downloadButton.waitFor({timeout:60000});
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),downloadButton.click()]);const zip=await JSZip.loadAsync(await fs.readFile(await download.path()));
  assert.equal(Object.keys(zip.files).filter(n=>n.endsWith('.dcm')).length,advanced?130:65);
  if(advanced){const reg=dp.parseDicom(await zip.file('DICOM/REG_001.dcm').async('uint8array')),moving=reg.elements.x00700308.items[1].dataSet;const m=moving.elements.x00700309.items[0].dataSet.elements.x0070030a.items[0].dataSet.string('x300600c6').split('\\').map(Number);assert.equal(m[3],12);}
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
 }
 assert.deepEqual(errors,[]);console.log('PASS basic and advanced ZIP downloads, original images + RTSTRUCT + REG, unsaved registration exported, English interface');
}finally{await browser.close();server.close();}



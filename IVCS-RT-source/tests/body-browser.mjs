import {createRequire} from 'node:module';
import express from 'express';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {libraryRouter,createLibrary} from '../server/library.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.argv[2] || 'playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'radcontour-body-ui-'));
await fs.writeFile(path.join(root,'preferences.json'),JSON.stringify({language:'es'}));
const app=express();app.use('/api/library',libraryRouter(root));app.use(express.static(path.resolve('dist')));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
const browser=await chromium.launch({headless:true,channel:'msedge'});
function fixture(){
  const n=128,huData=Array(n*n).fill(-1000);for(let y=20;y<100;y++)for(let x=25;x<103;x++)huData[y*n+x]=0;
  const slices=Array.from({length:5},(_,z)=>({id:'slice-'+z,sliceIndex:z,rows:n,cols:n,pixelSpacing:[1,1],sliceThickness:1,sliceLocation:z,imagePositionPatient:[0,0,z],imageOrientationPatient:[1,0,0,0,1,0],huData,minHU:-1000,maxHU:0,windowCenter:40,windowWidth:400,rescaleSlope:1,rescaleIntercept:0,sopInstanceUID:'1.2.3.99.'+(z+1),sopClassUID:'1.2.840.10008.5.1.4.1.1.2'}));
  const series={id:'body-series',patientId:'SYNTHETIC',patientName:'Synthetic^BODY',modality:'CT',studyDescription:'BODY validation',seriesDescription:'Phantom',studyInstanceUID:'1.2.3.98',seriesInstanceUID:'1.2.3.99',frameOfReferenceUID:'1.2.3.97',slices};
  const existing=Array(n*n).fill(0);existing[0]=1;
  return {format:'radcontour-session',version:1,series,studies:[series],rois:[{id:'body',name:'BODY corrected',type:'EXTERNAL',color:'#00ffff',visible:true,locked:false,opacity:.35,sliceMasks:{0:existing}},{id:'locked',name:'BODY locked',type:'EXTERNAL',color:'#ffffff',visible:true,locked:true,opacity:.35,sliceMasks:{0:existing}}],currentSliceIndex:0,activeRoiId:'body',windowCenter:40,windowWidth:400,registrationState:{active:false,referenceStudyId:series.id,secondaryStudyId:series.id,transforms:{},voi:{enabled:false,minX:0,maxX:127,minY:0,maxY:127,minSlice:0,maxSlice:4},fusionMode:'blend',fusionOpacity:.5,checkerboardSize:32,splitPosition:.5,secondaryWindowCenter:40,secondaryWindowWidth:400,secondaryColorMap:'grayscale'}};
}
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('input[accept=".json"]').setInputFiles({name:'body.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture()))});
  const save=async()=>{await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('status').filter({hasText:'Guardado manual · sin cambios'}).waitFor();};
  await save();await page.locator('#tab-structures').click();
  let writes=0;page.on('request',r=>{if(r.method()==='PUT' && r.url().endsWith('/session'))writes++;});
  const library=createLibrary(root),index=await library.list(),key=index.patients[0].studies[0].key;
  const original=(await library.open(key)).state;
  await page.locator('#btn-open-body-modal').click();
  assert.equal(await page.locator('#select-body-target-roi option[value="locked"]').isDisabled(),true);
  await page.locator('#btn-execute-body-generation').click();await page.locator('#btn-apply-body-generation').waitFor();
  await page.getByText('Vista previa: todavía no se ha modificado ninguna estructura.',{exact:true}).waitFor();
  assert.equal(writes,0);assert.match(await page.locator('#btn-apply-body-generation').innerText(),/\(4\)/);
  await page.screenshot({path:path.resolve('body-preview.png')});
  await page.locator('#btn-cancel-body-generation').click();assert.deepEqual((await library.open(key)).state,original);
  await page.locator('#btn-open-body-modal').click();
  await page.getByRole('spinbutton',{name:'Desde el corte'}).fill('2');await page.getByRole('spinbutton',{name:'Hasta el corte'}).fill('4');
  await page.locator('#btn-execute-body-generation').click();await page.getByText('Vista previa: todavía no se ha modificado ninguna estructura.',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Aplicar corte 3',exact:true}).uncheck();
  await page.locator('#btn-apply-body-generation').click();await page.locator('#modal-body-generator').waitFor({state:'hidden'});
  assert.equal(writes,0);await save();
  const changed=(await library.open(key)).state;
  assert.deepEqual(changed.rois.find(r=>r.id==='locked'),original.rois.find(r=>r.id==='locked'));
  const body=changed.rois.find(r=>r.id==='body');assert.deepEqual(Object.keys(body.sliceMasks).sort(),['0','1','3']);assert.deepEqual(body.sliceMasks[0],original.rois[0].sliceMasks[0]);
  // Invalidate results after changing a parameter, and close a running calculation before it can apply.
  await page.locator('#btn-open-body-modal').click();await page.locator('#btn-execute-body-generation').click();
  await page.getByText('Vista previa: todavía no se ha modificado ninguna estructura.',{exact:true}).waitFor();
  await page.getByRole('spinbutton',{name:'Umbral de tejido (HU)'}).fill('-750');assert.equal(await page.locator('#btn-apply-body-generation').isDisabled(),true);
  await page.locator('#btn-execute-body-generation').click();await page.locator('#btn-cancel-body-generation').click();await page.waitForTimeout(300);
  assert.equal(writes,1);assert.deepEqual((await library.open(key)).state,changed);
  await page.getByRole('button',{name:'Archivo y ayuda',exact:true}).click();await page.locator('#btn-show-help').click();
  await page.getByRole('combobox',{name:'Idioma de la interfaz'}).selectOption('en');await page.getByRole('button',{name:"Got it",exact:true}).click();
  await page.locator('#btn-open-body-modal').click();await page.getByText('Calculate, review and apply the body contour',{exact:true}).waitFor();
  await page.locator('#btn-execute-body-generation').click();await page.getByText('Preview: no structures have been changed yet.',{exact:true}).waitFor();
  await page.screenshot({path:path.resolve('body-preview-en.png')});await page.locator('#btn-cancel-body-generation').click();
  // Cancellation terminates a busy worker without allowing a late result.
  const workerFile=(await fs.readdir('dist/assets')).find(name=>/^compute\.worker-.*\.js$/.test(name));
  const cancellation=await page.evaluate(async workerUrl=>{
    const worker=new Worker(workerUrl,{type:'module'});
    let messages=0;worker.onmessage=()=>messages++;
    const slice={rows:1024,cols:1024,sliceIndex:0,pixelSpacing:[.5,.5],huData:new Int16Array(1024*1024).fill(0)};
    worker.postMessage({kind:'bodyBatch',args:[[slice],{}]});worker.terminate();await new Promise(resolve=>setTimeout(resolve,150));return messages;
  },'/assets/'+workerFile);
  assert.equal(cancellation,0);assert.deepEqual(errors,[]);
  console.log('PASS: BODY preview, locked destination, preserved corrections, slice interval, individual selection, parameter invalidation, cancellation and manual-only saving.');
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
  const absolute=path.resolve(root);assert.ok(absolute.startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(absolute).startsWith('radcontour-body-ui-'));
  await fs.rm(absolute,{recursive:true,force:true});
}

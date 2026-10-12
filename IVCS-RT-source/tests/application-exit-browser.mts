import {createRequire} from 'node:module';import express from 'express';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {libraryRouter,createLibrary} from '../server/library.mjs';import {applicationLifecycle} from '../server/application.mjs';import {sessionRecords} from '../src/utils/sessionStream';import {defaultRegistration} from '../src/utils/libraryClient';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true,channel:process.env.IVCS_BROWSER_CHANNEL || (process.platform==='win32'?'msedge':undefined)});
const diagnostics:any[]=[];
try{for(let iteration=0;iteration<Number(process.env.IVCS_EXIT_REPETITIONS||1);iteration++)for(const choice of ['save','discard']){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-exit-browser-')),app=express();let server:any,shutdowns=0,failSessionSave=false,failedSaves=0;
 const trace:any={iteration,choice,requests:[],responses:[],closed:false,stopCalls:0};diagnostics.push(trace);
 app.use((req,res,next)=>{const entry:any={url:req.url,method:req.method,listening:server?.listening,at:Date.now()};trace.requests.push(entry);res.once('finish',()=>{entry.status=res.statusCode;entry.finished=Date.now();});next();});
 const lifecycle=applicationLifecycle(()=>new Promise<void>(resolve=>{shutdowns++;trace.stopCalls++;trace.stopAt=Date.now();server.close(()=>{trace.closed=true;trace.closedAt=Date.now();resolve();});server.closeIdleConnections();}));app.use('/api/application',lifecycle.router);app.use(lifecycle.gate);
 // Inject the failure at the HTTP server so the real browser fetch/error path
 // is exercised without request interception after a beforeunload dialog.
 app.use('/api/library/session',(req,res,next)=>{
  if(req.method==='PUT'&&failSessionSave){failedSaves++;res.status(500).json({error:'Synthetic save failure'});return;}
  next();
 });
 app.use('/api/library',libraryRouter(root));app.use(express.static(path.resolve('dist')));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const url='http://127.0.0.1:'+server.address().port;
 const study:any={id:'ref',patientId:'SYNTHETIC-EXIT',patientName:'Synthetic^Exit',modality:'CT',studyDescription:'QA',seriesDescription:'QA',slices:Array.from({length:3},(_,z)=>({id:'z'+z,sliceIndex:z,rows:64,cols:64,huData:new Int16Array(4096),pixelSpacing:[1,1],sliceThickness:2,sliceLocation:2*z,imagePositionPatient:[0,0,2*z],imageOrientationPatient:[1,0,0,0,1,0],minHU:0,maxHU:0,windowCenter:40,windowWidth:400,rescaleSlope:1,rescaleIntercept:0}))};
 const roi:any={id:'r',name:'QA',type:'OAR',color:'#ff0000',visible:true,locked:false,opacity:.3,maskScale:2,sliceMasks:{}},session:any={format:'radcontour-session',version:1,series:study,studies:[study],rois:[roi],activeRoiId:'r',currentSliceIndex:1,windowCenter:40,windowWidth:400,registrationState:defaultRegistration('ref')};const file=path.join(root,'fixture.ivcs');await fs.writeFile(file,[...sessionRecords(session)].join(''));
 const context=await browser.newContext(),page=await context.newPage();page.on('response',response=>{if(response.url().includes('/api/application/'))trace.responses.push({url:response.url(),status:response.status(),at:Date.now()});});page.on('requestfailed',request=>{if(request.url().includes('/api/application/'))trace.responses.push({url:request.url(),error:request.failure(),at:Date.now()});});await page.addInitScript({content:'window.close=()=>{};'});await page.goto(url);await page.locator('input[accept=".json,.ivcs"]').setInputFiles(file);await page.waitForFunction(()=>document.querySelector('header')?.textContent?.includes('SYNTHETIC-EXIT'));const canvas=page.getByTestId('axial-canvas');await page.getByLabel('Contour mode',{exact:true}).selectOption('open');const b=(await canvas.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+20,b.y+b.height/2,{steps:5});await page.mouse.up();await page.getByText('Unsaved changes',{exact:true}).waitFor();
 const nativeDialog=new Promise<void>(resolve=>page.once('dialog',async d=>{assert.equal(d.type(),'beforeunload');await d.dismiss();resolve();}));await page.close({runBeforeUnload:true});await nativeDialog;assert.equal(page.isClosed(),false);await page.getByRole('dialog',{name:'Close IVCS RT'}).waitFor();assert.equal(shutdowns,0);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 const other=await context.newPage();await other.goto(url+'/library');await other.waitForLoadState('networkidle');await page.locator('#btn-exit-application').click();await page.getByTestId('exit-discard').click();await page.getByRole('alert').filter({hasText:'Close the other IVCS RT windows'}).waitFor();assert.equal(shutdowns,0);await other.close();
 if(choice==='save'){
  failSessionSave=true;await page.getByTestId('exit-save').click();await page.getByRole('alert').filter({hasText:'Synthetic save failure'}).waitFor();assert.equal(shutdowns,0);assert.equal((await fetch(url+'/api/application/status')).ok,true);assert.equal(failedSaves,1);failSessionSave=false;
 }
 await page.getByTestId('exit-'+choice).click();await page.getByText('Server stopped. You can now close this tab.',{exact:true}).waitFor({timeout:15000});assert.equal(shutdowns,1);
 const library=createLibrary(root),index=await library.list(),saved=await library.open(index.latest),masks=saved.state.rois[0].sliceMasks;assert.equal(Object.keys(masks).length>0,choice==='save');
 const event=await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});assert.equal(event,false);await context.close();console.log('PASS exit '+choice+': native close warning, cancel, other-window guard, saved data outcome, server stop and fallback page');
}console.log('Shutdown diagnostics',JSON.stringify(diagnostics));}catch(error){
 console.error('Shutdown diagnostics',JSON.stringify(diagnostics));
 for(const page of browser.contexts().flatMap(context=>context.pages())){
  console.error('Exit failure UI:',await page.locator('body').innerText().catch(()=>'<closed>'));
  await page.screenshot({path:'build/application-exit-failure.png'}).catch(()=>{});
 }
 throw error;
}finally{await browser.close();}

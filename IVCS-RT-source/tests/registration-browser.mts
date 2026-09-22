import {createRequire} from 'node:module';import express from 'express';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {libraryRouter,createLibrary} from '../server/library.mjs';import {enhancedFixture} from './helpers/enhancedFixture';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-4d-browser-')),app=express();app.use('/api/library',libraryRouter(root));app.use(express.static(path.resolve('dist')));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({headless:true,channel:process.env.IVCS_BROWSER_CHANNEL || (process.platform==='win32'?'msedge':undefined)});

try{
 const {createDemoRadiotherapyDataset}=await import('../src/utils/demoData');
 const {sessionRecords}=await import('../src/utils/sessionStream');
 const d=createDemoRadiotherapyDataset(),s=d.series;
 const session=sessionRecords({format:'radcontour-session',version:1,series:s,studies:d.studies,rois:d.initialRois,currentSliceIndex:32,activeRoiId:d.initialRois[0].id,windowCenter:40,windowWidth:400,registrationState:d.registrationState});
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 const handle=await fs.open(path.join(root,'synthetic.ivcs'),'w');try{for(const record of session)await handle.write(record);}finally{await handle.close();}
 await page.locator('input[accept=".json,.ivcs"]').setInputFiles(path.join(root,'synthetic.ivcs')); 
 await page.waitForFunction(()=>document.querySelector('header')?.textContent?.includes('Luciano'),{},{timeout:60000});
 await page.locator('#btn-open-registration').click();const dialog=page.locator('section').filter({has:page.getByRole('heading',{name:'Rigid 3D registration'})});

 assert.equal(await dialog.locator('[data-testid^="registration-"]').count(),4);
 const canvas=dialog.getByTestId('registration-axial');const image=()=>canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL());const before=await image();
 await dialog.getByRole('combobox',{name:'Registration layout',exact:true}).selectOption('row');
 await dialog.locator('select').filter({has:page.locator('option[value="checkerboard"]')}).selectOption('checkerboard');await page.waitForTimeout(200);assert.notEqual(await image(),before);
 await dialog.locator('select').filter({has:page.locator('option[value="checkerboard"]')}).selectOption('split_horizontal');
 await dialog.getByLabel('Curtain position').fill('0');await page.waitForTimeout(100);const left=await image();await dialog.getByLabel('Curtain position').fill('1');await page.waitForTimeout(100);assert.notEqual(await image(),left);
 await dialog.locator('select').filter({has:page.locator('option[value="checkerboard"]')}).selectOption('blend');
 // Synthetic CT and MR share their FoR: fixed reference protection must trigger.
 await dialog.getByLabel('Translation X (mm)',{exact:true}).fill('5');await dialog.getByRole('alert').filter({hasText:'fixed reference'}).waitFor();assert.equal(await dialog.getByLabel('Translation X (mm)',{exact:true}).inputValue(),'0');
 await dialog.getByLabel('Resolution policy').selectOption('single');
 // Zoom affects the view, never the physical registration or slice position.
 const xyz=dialog.getByLabel('Translation X (mm)',{exact:true});
 async function horizontalDrag(){const b=(await canvas.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+16,b.y+b.height/2,{steps:3});await page.mouse.up();await page.waitForTimeout(150);}
 const start=Number(await xyz.inputValue());await horizontalDrag();const baseDelta=Number(await xyz.inputValue())-start;
 const sliceBefore=await dialog.getByLabel('Slice Axial',{exact:true}).inputValue();
 await dialog.getByRole('button',{name:'Registration zoom',exact:true}).click();
 const box=(await canvas.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-350);await page.waitForTimeout(300);
 const zoomText=await dialog.getByTestId('zoom-axial').innerText();assert.ok(parseInt(zoomText)>100);assert.equal(await dialog.getByTestId('zoom-coronal').innerText(),'100%');assert.equal(await dialog.getByLabel('Slice Axial',{exact:true}).inputValue(),sliceBefore);assert.equal(Number(await xyz.inputValue()),start+baseDelta);
 await dialog.getByRole('button',{name:'Link zoom across three planes',exact:true}).click();assert.equal(await dialog.getByTestId('zoom-coronal').innerText(),zoomText);assert.equal(await dialog.getByTestId('zoom-sagittal').innerText(),zoomText);
 await dialog.getByRole('button',{name:'Registration zoom',exact:true}).click();const old=Number(await xyz.inputValue());await horizontalDrag();const zoomDelta=Number(await xyz.inputValue())-old;assert.ok(Math.abs(zoomDelta-baseDelta/Math.exp(.7))<.02,'Physical drag must compensate zoom');
 await dialog.getByRole('button',{name:'Link zoom across three planes',exact:true}).click();await dialog.getByRole('button',{name:'Registration zoom',exact:true}).click();
 const cb=(await dialog.getByTestId('registration-coronal').boundingBox())!;await page.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2);await page.mouse.down();await page.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2-25,{steps:3});await page.mouse.up();await page.waitForTimeout(200);assert.notEqual(await dialog.getByTestId('zoom-coronal').innerText(),zoomText);assert.equal(await dialog.getByTestId('zoom-axial').innerText(),zoomText);
 await dialog.getByRole('button',{name:'Reset zoom',exact:true}).click();for(const plane of ['axial','coronal','sagittal'])assert.equal(await dialog.getByTestId('zoom-'+plane).innerText(),'100%');await dialog.getByRole('button',{name:'Registration zoom',exact:true}).click();

 async function dragPlane(plane:string,rotate=false){const c=dialog.getByTestId('registration-'+plane);await c.scrollIntoViewIfNeeded();const b=(await c.boundingBox())!;const x=b.x+b.width*.6,y=b.y+b.height*.45;await page.mouse.move(x,y);if(rotate)await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(x+12,y+12,{steps:4});await page.mouse.up();if(rotate)await page.keyboard.up('Shift');await page.waitForTimeout(150);}
 for(const plane of ['axial','coronal','sagittal']){
  const old=await Promise.all(['axial','coronal','sagittal'].map(p=>dialog.getByTestId('registration-'+p).evaluate((c:HTMLCanvasElement)=>c.toDataURL())));
  await dragPlane(plane);await dragPlane(plane,true);
  const changed=await Promise.all(['axial','coronal','sagittal'].map(p=>dialog.getByTestId('registration-'+p).evaluate((c:HTMLCanvasElement)=>c.toDataURL())));assert.ok(changed.every((s,i)=>s!==old[i]),plane+' must update all three views');
 }
 await dialog.getByRole('combobox',{name:'Registration layout',exact:true}).selectOption('oneplus2');await page.screenshot({path:'build/registration-triplanar.png'});

 const beforeGesture=await xyz.inputValue();await dragPlane('axial');const afterGesture=await xyz.inputValue();assert.notEqual(afterGesture,beforeGesture);
 await dialog.getByRole('button',{name:'Undo registration',exact:true}).click();assert.equal(await xyz.inputValue(),beforeGesture);
 await dialog.getByRole('button',{name:'Redo registration',exact:true}).click();assert.equal(await xyz.inputValue(),afterGesture);
 const finalPreview=await image();await dialog.getByRole('button',{name:'Compare with initial',exact:true}).click();await page.waitForTimeout(200);assert.notEqual(await image(),finalPreview);await dialog.getByRole('button',{name:'Compare with initial',exact:true}).click();
 await dialog.getByLabel('Link physical scale (mm/pixel)',{exact:true}).check();await dialog.getByRole('button',{name:'Link zoom across three planes',exact:true}).click();await page.waitForTimeout(200);
 const scales=await Promise.all(['axial','coronal','sagittal'].map(p=>dialog.getByTestId('zoom-'+p).getAttribute('data-mm-per-pixel')));assert.ok(scales.every(s=>Math.abs(Number(s)-Number(scales[0]))<1e-6));
 await dialog.getByRole('button',{name:'Link zoom across three planes',exact:true}).click();await dialog.getByLabel('Link physical scale (mm/pixel)',{exact:true}).uncheck();await dialog.getByRole('button',{name:'Reset zoom',exact:true}).click();
 await dialog.getByRole('button',{name:'Anatomical landmarks',exact:true}).click();assert.equal(await dialog.locator('canvas').count(),6);
 for(const c of [dialog.getByTestId('registration-coronal').nth(0),dialog.getByTestId('registration-sagittal').nth(1)]){await c.scrollIntoViewIfNeeded();await c.click({position:{x:(await c.boundingBox())!.width/2,y:(await c.boundingBox())!.height/2}});}
 await dialog.getByRole('button',{name:'Add pair',exact:true}).click();assert.ok((await dialog.innerText()).includes('Pair 1'));
 await dialog.getByRole('button',{name:'Manual',exact:true}).click();
 await dialog.getByRole('button',{name:'Automatic local',exact:true}).click();assert.equal(await dialog.locator('canvas').count(),3);
 await dialog.getByLabel('Drag action').selectOption('voi');await dragPlane('axial');assert.equal(await dialog.getByLabel('Use VOI for automatic registration').isChecked(),true);assert.ok(Number(await dialog.getByLabel('VOI X max').inputValue())<255);
 // A generous physical VOI for live automatic registration and cancellation.
 await dialog.getByRole('button',{name:'Whole volume',exact:true}).click();
 await dialog.getByLabel('VOI X min').fill('60');await dialog.getByLabel('VOI X max').fill('190');await dialog.getByLabel('VOI Y min').fill('60');await dialog.getByLabel('VOI Y max').fill('190');await dialog.getByLabel('Use VOI for automatic registration').check();
 await dialog.getByRole('button',{name:'Compute automatic 3D registration',exact:true}).click();await dialog.getByRole('button',{name:'Cancel computation',exact:true}).waitFor();await dialog.getByRole('status').filter({hasText:'%'}).waitFor({timeout:60000});await dialog.getByRole('button',{name:'Cancel computation',exact:true}).click();await dialog.getByRole('alert').waitFor();
 await dialog.getByRole('button',{name:'Compute automatic 3D registration',exact:true}).click();await dialog.getByRole('button',{name:'Accept transformation',exact:true}).waitFor({timeout:120000});assert.equal(await dialog.locator('canvas').count(),3);
 await page.screenshot({path:'build/registration-auto-voi.png'});await dialog.getByRole('button',{name:'Discard proposal',exact:true}).click();
 await dialog.getByRole('button',{name:'Save group to library',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const index=await createLibrary(root).list();assert.deepEqual(index.patients[0].groups[0].detachedSeriesIds,['synthetic-MR']);
 await page.locator('#btn-open-body-modal').click();assert.equal(await page.getByLabel('BODY destination').inputValue(),'new');
 assert.deepEqual(errors,[]);console.log('PASS triplanar layouts, fusion, physical drags in every plane, fixed-reference conflict and explicit detach, VOI drawing, live automatic progress/cancel/proposal and group persistence');
}catch(e){for(const page of browser.contexts().flatMap(c=>c.pages()))await page.screenshot({path:'build/registration-failure.png'}).catch(()=>{});throw e;}finally{await browser.close();server.close();}

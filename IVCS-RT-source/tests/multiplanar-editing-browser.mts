import {createRequire} from 'node:module';import express from 'express';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {libraryRouter,createLibrary} from '../server/library.mjs';import {enhancedFixture} from './helpers/enhancedFixture';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-edit-browser-')),app=express();app.use('/api/library',libraryRouter(root));app.use(express.static(path.resolve('dist')));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({headless:true,channel:process.env.IVCS_BROWSER_CHANNEL || (process.platform==='win32'?'msedge':undefined)});


try{
 const {createDemoRadiotherapyDataset}=await import('../src/utils/demoData');
 const {sessionRecords,readSessionFile}=await import('../src/utils/sessionStream');
 const d=createDemoRadiotherapyDataset(),roi={...d.initialRois[0],id:'test-edit',name:'Editing test',locked:false,visible:true,maskScale:process.env.IVCS_MASK_SCALE==='2'?2 as const:1 as const,sliceMasks:{}};
 const records=sessionRecords({format:'radcontour-session',version:1,series:d.series,studies:d.studies,rois:[roi],currentSliceIndex:32,activeRoiId:roi.id,windowCenter:40,windowWidth:400,registrationState:d.registrationState});
 const handle=await fs.open(path.join(root,'synthetic.ivcs'),'w');try{for(const record of records)await handle.write(record);}finally{await handle.close();}
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{(window as any).showSaveFilePicker=undefined;});
 await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await page.locator('input[accept=".json,.ivcs"]').setInputFiles(path.join(root,'synthetic.ivcs'));
 await page.waitForFunction(()=>document.querySelector('header')?.textContent?.includes('Luciano'),{},{timeout:60000});
 await page.getByLabel('Contour mode',{exact:true}).selectOption('open');
 await page.locator('#btn-contour-tool-brush').click();
 async function saved(){await page.locator('#btn-export-menu').click();const download=page.waitForEvent('download');await page.locator('#btn-export-json').click();const f=await download;const saved=await readSessionFile(new Blob([await fs.readFile((await f.path())!)]));for(const r of saved.rois)for(const [z,m] of Object.entries(r.sliceMasks)){const sl=saved.series.slices[Number(z)];assert.equal(m.length,sl.rows*sl.cols*(r.maskScale||1)**2);}return saved;}
 const count=(r:any)=>Object.values(r.sliceMasks).reduce((sum:number,m:any)=>sum+Array.from(m).filter(Boolean).length,0) as number;
 async function stroke(c:any,owner=page){await c.waitFor();await owner.waitForTimeout(100);const b=await c.boundingBox();assert.ok(b.width>100&&b.height>100,JSON.stringify(b));await owner.mouse.move(b.x+b.width/2-18,b.y+b.height/2+16);await owner.mouse.down();await owner.mouse.move(b.x+b.width/2+18,b.y+b.height/2+16,{steps:8});await owner.mouse.up();await owner.waitForTimeout(100);}
 await stroke(page.getByTestId('axial-canvas'));assert.ok(count((await saved()).rois[0])>0,'single axial');if(roi.maskScale===1){const before=await saved();await page.locator('#tab-structures').click();await page.getByRole('button',{name:'Upgrade to 2×',exact:true}).click();await page.waitForFunction(()=>(document.querySelector('select[aria-label="Mask resolution"]') as HTMLSelectElement)?.value==='2');const upgraded=await saved();assert.equal(upgraded.rois[0].maskScale,2);assert.equal(count(upgraded.rois[0]),4*count(before.rois[0]));await page.locator('#tab-tools').click();await page.locator('#btn-panel-undo').click();assert.equal((await saved()).rois[0].maskScale,1);}await page.locator('#tab-tools').click();await page.locator('#btn-panel-undo').click();assert.equal(count((await saved()).rois[0]),0);
 for(const layout of ['oneplus2','triplanar']){
  await page.locator('#mpr-tab-'+layout).click();
  for(const [index,plane] of ['axial','sagittal','coronal'].entries()){
   const c=page.getByTestId('view-pane-'+index).getByTestId('editable-'+plane);await stroke(c);const session=await saved();assert.ok(count(session.rois[0])>0,layout+' '+plane+' failed to draw');
   if(plane!=='axial')assert.ok(Object.keys(session.rois[0].sliceMasks).length>1,'orthogonal stroke must update multiple axial slices');
   await page.locator('#tab-tools').click();if(layout==='oneplus2'&&plane==='coronal'){await page.locator('#btn-panel-clear-slice').click();assert.equal(count((await saved()).rois[0]),0,'clear targets active coronal plane');await page.locator('#btn-panel-undo').click();assert.ok(count((await saved()).rois[0])>0);}
   await page.locator('#btn-panel-undo').click();assert.equal(count((await saved()).rois[0]),0,'one undo must remove the whole stroke');
  }
 }
 await page.locator('#mpr-tab-oneplus2').click();
 const sagittal=page.getByTestId('view-pane-1').getByTestId('editable-sagittal');
 await page.getByLabel('Contour mode',{exact:true}).selectOption('closed');await page.locator('#btn-contour-tool-polygon').click();
 const sb=(await sagittal.boundingBox())!;for(const [x,y] of [[-25,-25],[25,-25],[0,25]])await page.mouse.click(sb.x+sb.width/2+x,sb.y+sb.height/2+y);
 await sagittal.press('Enter');assert.ok(count((await saved()).rois[0])>0,'orthogonal polygon Enter');await page.locator('#btn-panel-undo').click();assert.equal(count((await saved()).rois[0]),0);
 await page.getByLabel('Contour mode',{exact:true}).selectOption('open');await page.locator('#btn-contour-tool-brush').click();
 const pane=page.getByTestId('view-pane-0');await page.getByRole('combobox',{name:'Panel mode 1',exact:true}).selectOption('blend');await stroke(pane.getByTestId('editable-axial'));assert.ok(count((await saved()).rois[0])>0,'fusion contour');
 const popupPromise=page.waitForEvent('popup');await page.getByTestId('detach-pane-0').click();const popup=await popupPromise;popup.on('pageerror',e=>errors.push(e.message));await popup.waitForLoadState();await stroke(popup.getByTestId('editable-axial'),popup);
 assert.ok(Number(await popup.getByTestId('editable-axial').getAttribute('data-zoom'))*(roi.maskScale||1)>1,'popup must fit after styles load');
 await popup.keyboard.down('Space');assert.match(await page.locator('#btn-contour-tool-pan').getAttribute('class')||'',/bg-blue-800/);
 const pb=(await popup.getByTestId('editable-axial').boundingBox())!;await popup.mouse.move(pb.x+pb.width/2,pb.y+pb.height/2);await popup.mouse.down();await popup.keyboard.up('Space');assert.match(await page.locator('#btn-contour-tool-brush').getAttribute('class')||'',/bg-blue-800/);await popup.mouse.up();
 await popup.screenshot({path:`build/detached-editing-20260923-${roi.maskScale}x.png`});
 const a=count((await saved()).rois[0]);assert.ok(a>0);
 const toolsPromise=page.waitForEvent('popup');await page.getByTestId('detach-tools').click();const tools=await toolsPromise;await tools.waitForLoadState();await tools.locator('#btn-contour-tool-eraser').click();await stroke(popup.getByTestId('editable-axial'),popup);assert.ok(count((await saved()).rois[0])<a,'detached toolbar must change detached editor tool');
 await page.screenshot({path:`build/multiplanar-editing-20260923-${roi.maskScale}x.png`});
 await popup.close();await page.getByTestId('detach-pane-0').waitFor();await tools.getByTestId('dock-tools').click();await page.locator('#btn-contour-tool-brush').click();
 await stroke(page.getByTestId('view-pane-2').getByTestId('editable-coronal'));
 await page.locator('#tab-operations').click();await page.getByTestId('open-cleanup').click();await page.getByRole('dialog').locator('select').first().selectOption('closing');await page.getByTestId('cleanup-preview').click();await page.getByTestId('cleanup-summary').waitFor({timeout:30000});await page.screenshot({path:`build/cleanup-preview-20260923-${roi.maskScale}x.png`});
 await page.getByLabel('I have reviewed the volume and contour changes.').check();await page.getByTestId('cleanup-apply').click();const cleaned=await saved();assert.equal(cleaned.rois.length,2,'cleanup should create a new structure by default');
 await page.locator('#tab-tools').click();await page.locator('#btn-panel-undo').click();assert.equal((await saved()).rois.length,1,'cleanup must be undoable');
 assert.deepEqual(errors,[]);console.log('PASS editing axial/coronal/sagittal in 1+2 and 2x2, atomic undo, fusion editing, detached editor and toolbar, redock, cleanup preview/apply/undo');
}finally{await browser.close();server.close();}

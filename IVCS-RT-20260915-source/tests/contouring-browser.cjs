// node tests/contouring-browser.cjs <path-to-playwright>, Vite on localhost:3000.
const {chromium}=require(process.argv[2] || 'playwright');
const assert=require('node:assert/strict');
(async()=> {
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('status').filter({hasText:'Guardado en este navegador'}).waitFor({timeout:30000});
  await page.evaluate(async()=> {
   const {saveSession}=await import('/src/utils/session.ts');
   const slice={id:'synthetic',sliceIndex:0,rows:128,cols:128,pixelSpacing:[1,1],sliceThickness:1,sliceLocation:0,imagePositionPatient:[0,0,0],imageOrientationPatient:[1,0,0,0,1,0],huData:new Int16Array(128*128),minHU:0,maxHU:0,windowCenter:40,windowWidth:400,rescaleSlope:1,rescaleIntercept:0};
   const series={patientName:'Rendering test',patientId:'TEST',modality:'CT',studyDescription:'Synthetic',seriesDescription:'Synthetic',slices:[slice]};
   await saveSession({format:'radcontour-session',version:1,series,studies:[{...series,id:'ref'}],rois:[{id:'roi',name:'Test ROI',type:'PTV',color:'#ff0000',visible:true,locked:false,opacity:0.5,sliceMasks:{}}],currentSliceIndex:0,activeRoiId:'roi',windowCenter:40,windowWidth:400,registrationState:{active:false,referenceStudyId:'ref',secondaryStudyId:'ref',transforms:{},voi:{enabled:false},fusionMode:'blend',fusionOpacity:0.5,checkerboardSize:32,splitPosition:0.5,secondaryWindowCenter:40,secondaryWindowWidth:400,secondaryColorMap:'grayscale'}});
  });
  await page.reload();
  await page.getByRole('status').filter({hasText:'Guardado en este navegador'}).waitFor({timeout:30000});
  const canvas=page.locator('canvas').first();
  const geometry=await canvas.evaluate(c=> {
    const rect=c.getBoundingClientRect();
    const zoom=Number(document.body.innerText.match(/ZOOM:\s*([\d.]+)x/)[1]);
    return {left:rect.left,top:rect.top,width:c.width,height:c.height,sx:rect.width/c.width,sy:rect.height/c.height,zoom};
  });
  const point=(x,y)=>({x:geometry.left+(geometry.width/2+(x-64)*geometry.zoom)*geometry.sx,y:geometry.top+(geometry.height/2+(y-64)*geometry.zoom)*geometry.sy});
  const pixel=async(x,y)=>canvas.evaluate(async(c,{x,y,z})=> {
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    return Array.from(c.getContext('2d').getImageData(Math.round(c.width/2+(x-64)*z),Math.round(c.height/2+(y-64)*z),1,1).data);
  },{x,y,z:geometry.zoom});
  const red=p=>p[0]-p[1]>40;
  const savedMask=()=>page.evaluate(async()=> {
    const {loadSession}=await import('/src/utils/session.ts');
    const s=await loadSession();return Array.from(s.rois[0].sliceMasks[0] || []);
  });
  const waitSaved=async(expected)=> {
    const deadline=Date.now()+10000;
    while(Date.now()<deadline) {
      const mask=await savedMask();
      if(mask[40*128+80]===expected) return mask;
      await page.waitForTimeout(50);
    }
    throw new Error('Timed out waiting for the edited mask to be saved');
  };
  for(const smooth of [true,false]) {
    if(!smooth) await page.getByRole('button',{name:'Bordes Suaves',exact:false}).click();
    await page.getByRole('button',{name:/^Brocha\b/}).click();
    const from=point(20,40),to=point(100,40);
    await page.mouse.move(from.x,from.y);await page.mouse.down();
    assert.ok(red(await pixel(20,40)),'initial stamp must be visible');
    for(const x of [40,60,80,100]) { const p=point(x,40);await page.mouse.move(p.x,p.y); }
    assert.ok(red(await pixel(80,40)),`live stroke clipped with smooth=${smooth}`);
    await page.mouse.up();
    assert.ok(red(await pixel(80,40)),'committed stroke must remain visible');
    const mask=await waitSaved(1);for(let x=20;x<=100;x++) assert.equal(mask[40*128+x],1);
    await page.getByRole('button',{name:/^Borrador\b/}).click();
    await page.mouse.move(from.x,from.y);await page.mouse.down();
    await page.mouse.move(to.x,to.y,{steps:8});
    assert.ok(!red(await pixel(80,40)),'eraser preview must update beyond the initial area');
    await page.mouse.up();assert.ok(!red(await pixel(80,40)),'erased line reappeared');
    await waitSaved(0);
  }
  // Pointer-up may carry a position newer than the last pointer-move.
  await page.getByRole('button',{name:/^Brocha\b/}).click();
  const from=point(20,80),to=point(100,80);
  await page.mouse.move(from.x,from.y);await page.mouse.down();
  await canvas.dispatchEvent('pointerup',{pointerId:1,isPrimary:true,button:0,buttons:0,clientX:to.x,clientY:to.y});
  await page.mouse.up();
  assert.ok(red(await pixel(80,80)),'pointer-up endpoint was dropped');
  assert.deepEqual(errors,[]);
  console.log('PASS: live and committed brush/eraser, smooth and exact borders, empty-mask repaint, continuous saved masks, final pointer sample; no page errors.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

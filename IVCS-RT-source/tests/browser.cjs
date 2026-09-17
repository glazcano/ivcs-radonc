// node tests/browser.cjs <path-to-playwright>, with Vite on port 3000.
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
(async()=> {
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page = await browser.newPage({viewport:{width:1600,height:1000}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('status').filter({hasText:'Guardado en este navegador'}).waitFor({timeout:30000});
  const snapshot=()=>page.evaluate(async()=> {
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('radcontour',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const value=await new Promise((resolve,reject)=>{const r=db.transaction('sessions').objectStore('sessions').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   db.close();return {name:value.rois[0].name,count:value.rois.length,mask:Array.from(value.rois[0].sliceMasks[0]),pixels:Array.from(value.series.slices[0].huData)};
  });
  const before=await snapshot();
  await page.reload();
  await page.getByRole('status').filter({hasText:'Guardado en este navegador'}).waitFor({timeout:30000});
  assert.deepEqual(await snapshot(),before);
  await page.locator('#btn-export-menu').click();
  const downloadPromise=page.waitForEvent('download');await page.locator('#btn-export-json').click();
  const download=await downloadPromise;
  const path=await download.path();assert.ok(path);
  const saved=JSON.parse(require('node:fs').readFileSync(path,'utf8'));
  saved.rois[0].name='Recovered contour';
  require('node:fs').writeFileSync(path,JSON.stringify(saved));
  await page.locator('input[accept=".json"]').setInputFiles(path);
  try { await page.waitForFunction(()=>document.body.textContent.includes('Recovered contour'),{},{timeout:90000}); }
  catch(e) { console.error((await page.locator('body').innerText()).slice(0,7000)); throw e; }
  await page.waitForFunction(async()=> {
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('radcontour',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const value=await new Promise((resolve,reject)=>{const r=db.transaction('sessions').objectStore('sessions').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    db.close();return value?.rois[0].name==='Recovered contour';
  },{},{timeout:90000,polling:500});
  await page.getByRole('status').filter({hasText:'Guardado en este navegador'}).waitFor({timeout:30000});
  assert.deepEqual(await snapshot(),{...before,name:'Recovered contour'});
  assert.deepEqual(errors,[]);
  console.log('PASS: IndexedDB save, reload recovery, JSON export/import, masks and pixels preserved; no page errors.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

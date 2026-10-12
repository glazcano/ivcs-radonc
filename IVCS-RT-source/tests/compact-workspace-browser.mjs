import {createRequire} from 'node:module';
import express from 'express';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {libraryRouter} from '../server/library.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-compact-'));
await fs.cp('build/release-common/data',root,{recursive:true});
const app=express();
app.use('/api/library',libraryRouter(root));
app.use(express.static(path.resolve('dist')));
app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:process.env.IVCS_BROWSER_CHANNEL || (process.platform==='win32'?'msedge':undefined)});
const measurements=[];
try{
 for(const language of ['en','es']){
  const response=await fetch(url+'/api/library/settings',{method:'PUT',headers:{'Content-Type':'application/json','X-RadContour':'local'},body:JSON.stringify({language})});
  assert.ok(response.ok);
  for(const [width,height] of [[1366,768],[1920,1080]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url);
   await page.waitForFunction(()=>document.querySelector('header')?.textContent?.includes('Luciano'),{},{timeout:60000});
   const expectedWidth=width<1600?320:360;
   assert.equal(await page.locator('aside').evaluate(e=>e.getBoundingClientRect().width),expectedWidth);
   for(const layout of ['oneplus2','triplanar']){
    await page.locator('#mpr-tab-'+layout).click();
    await page.getByTestId('view-pane-0').locator('canvas').waitFor();
    await page.waitForTimeout(200);
    const metrics=await page.evaluate(()=>{
     const panes=[...document.querySelectorAll('[data-testid^="view-pane-"]')];
     const canvases=panes.flatMap(p=>[...p.querySelectorAll('canvas[data-testid]')]);
     return{
      headers:panes.map(p=>p.querySelectorAll('.pane-header').length),
      area:canvases.reduce((sum,c)=>{const r=c.getBoundingClientRect();return sum+r.width*r.height;},0),
      clipped:[...document.querySelectorAll('button,select,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1);}).map(e=>e.getAttribute('aria-label')||e.textContent),
     };
    });
    assert.ok(metrics.headers.every(count=>count===1),JSON.stringify(metrics));
    assert.deepEqual(metrics.clipped,[]);
    // Guard the usable canvas gain over the pre-compaction synthetic fixture.
    const baseline=width===1366?(layout==='oneplus2'?475167:453108):(layout==='oneplus2'?1222180:1188108);
    assert.ok(metrics.area>baseline*1.07,JSON.stringify({width,height,layout,...metrics}));
    measurements.push({language,width,height,layout,...metrics});
   }
   const roiBefore=await page.locator('#context-toolbar strong').textContent();
   await page.locator('#btn-contour-tool-eraser').click();
   await page.getByTitle(language==='es'?'Ocultar panel':'Hide panel',{exact:true}).click();
   assert.equal(await page.locator('aside').evaluate(e=>e.getBoundingClientRect().width),40);
   assert.ok(await page.locator('#context-toolbar').evaluate(e=>e.getBoundingClientRect().width>=innerWidth-42));
   await page.getByTitle(language==='es'?'Mostrar panel':'Show panel',{exact:true}).click();
   assert.equal(await page.locator('aside').evaluate(e=>e.getBoundingClientRect().width),expectedWidth);
   assert.equal(await page.locator('#context-toolbar strong').textContent(),roiBefore);
   assert.match(await page.locator('#btn-contour-tool-eraser').getAttribute('class'),/bg-blue-800/);
   const filters=page.locator('.roi-filters');
   await filters.locator('summary').click();
   await filters.getByLabel(language==='es'?'Favoritas':'Favorites',{exact:true}).check();
   await filters.locator('summary').click();
   assert.ok((await filters.locator('summary').innerText()).includes(language==='es'?'Favoritas':'Favorites'));
   await filters.locator('summary').click();
   await filters.getByLabel(language==='es'?'Favoritas':'Favorites',{exact:true}).uncheck();
   await filters.locator('summary').click();
   await page.screenshot({path:`build/compact-workspace-${language}-${width}.png`});
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }
 await fs.writeFile('build/compact-workspace-metrics.json',JSON.stringify(measurements,null,2));
 console.log('PASS compact canvas area, one pane header, full sidebar collapse, preserved ROI/tool, visible active filters and bilingual layouts');
}catch(error){
 for(const page of browser.contexts().flatMap(context=>context.pages()))await page.screenshot({path:'build/compact-workspace-failure.png'}).catch(()=>{});
 throw error;
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
 await fs.rm(root,{recursive:true,force:true});
}

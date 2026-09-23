import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');
const baseURL=process.env.IVCS_RELEASE_URL || 'http://127.0.0.1:33317';
const revision=process.env.IVCS_RELEASE_REVISION || new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
const browser=await chromium.launch({headless:true,channel:process.env.IVCS_BROWSER_CHANNEL || (process.platform==='win32'?'msedge':undefined)});
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseURL);
 await page.waitForFunction(()=>document.body.textContent.includes('CTV_Prostate'),{},{timeout:60000});
 await page.getByRole('button',{name:'Save',exact:true}).waitFor();
 await page.waitForTimeout(1200);
 assert.match(await page.locator('body').innerText(),/Bello Luciano/);
 assert.match(await page.locator('body').innerText(),/Fusion · CT \+ MR/);
 await page.screenshot({path:'build/release-start.png'});
 await page.locator('#mpr-tab-oneplus2').click();await page.getByTestId('editable-axial').waitFor();await page.getByTestId('editable-coronal').waitFor();await page.getByTestId('editable-sagittal').waitFor();await page.getByTestId('detach-pane-0').waitFor();await page.getByTestId('detach-tools').waitFor();await page.locator('#tab-operations').click();await page.getByTestId('open-cleanup').waitFor();
 await page.getByRole('button',{name:'File and help',exact:true}).click();await page.locator('#btn-show-help').click();await page.locator('#btn-show-about').click();
 const about=await page.locator('#about-ivcs-rt').innerText();for(const text of [revision,'Gabriel Lazcano','MIT License','Google AI Studio','Chat GPT 6 Astra'])assert.ok(about.includes(text),text);
 await page.screenshot({path:'build/release-about.png'});
 assert.equal((await page.request.get(baseURL+'/LICENSE.txt')).status(),200);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS Windows executable, English default, synthetic CT/MR fusion and ROIs, About MIT/copyright/date, license download, no browser errors');
}finally{await browser.close();}

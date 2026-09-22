import {build} from 'esbuild';
import express from 'express';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IVCS_PLAYWRIGHT_MODULE || 'playwright');
const result=await build({stdin:{contents:`
import * as THREE from 'three';
import {ContourCompositor} from './src/utils/contourCompositor';
const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(256,256);document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,100),group=new THREE.Group();scene.add(group,new THREE.AmbientLight(0xffffff,2));
for(const [radius,color] of [[2,'#ff0000'],[1.2,'#00ff00'],[.6,'#0000ff']])group.add(new THREE.Mesh(new THREE.SphereGeometry(radius,24,16),new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide})));
const compositor=new ContourCompositor(renderer);
window.check=(opacity,angle,reverse=false)=>{camera.position.set(Math.sin(angle)*8,0,Math.cos(angle)*8);camera.lookAt(0,0,0);if(reverse)group.children.reverse();compositor.render(scene,camera,group,opacity);const gl=renderer.getContext(),pixels=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return Array.from(pixels);};
window.dispose=()=>{compositor.dispose();group.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});renderer.dispose();};
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',write:false});
const app=express();app.get('/favicon.ico',(_,res)=>res.status(204).end());app.get('/',(_,res)=>res.send('<script type="module" src="/test.js"></script>'));app.get('/test.js',(_,res)=>res.type('js').send(result.outputFiles[0].text));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({headless:true,channel:process.env.IVCS_BROWSER_CHANNEL || (process.platform==='win32'?'msedge':undefined),args:['--enable-unsafe-swiftshader']});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.check);
for(const angle of [0,.7,1.8,3.1]){
const a=await page.evaluate(a=>window.check(.5,a),angle),b=await page.evaluate(a=>window.check(.5,a,true),angle);
assert.ok(a.reduce((max,v,i)=>Math.max(max,Math.abs(v-b[i])),0)<=1,'order independent nested surfaces');
const center=(128*256+128)*4;assert.ok(a[center]>70&&a[center+1]>70&&a[center+2]>70,'all three nested colors contribute');
const outline=await page.evaluate(a=>window.check(0,a),angle);assert.deepEqual(outline.slice(center,center+3),outline.slice(0,3),'zero opacity removes fill');
assert.ok(outline.some((v,i)=>i%4!==3&&Math.abs(v-outline[i%4])>50),'silhouettes remain at zero');
const opaque=await page.evaluate(a=>window.check(1,a),angle);assert.ok(opaque[center]>opaque[center+1]+50,'opaque outer surface depth occludes');
}
await page.screenshot({path:'build/3d-transparency-test.png'});await page.evaluate(()=>window.dispose());assert.deepEqual(errors,[]);console.log('PASS nested volumes, four rotations, reversed draw order, zero-opacity silhouettes, opaque depth');
}finally{await browser.close();server.close();}



import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {applicationLifecycle} from '../server/application.mjs';
import {spawn} from 'node:child_process';import {once} from 'node:events';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';

test('shutdown requires a local origin, explicit header and per-process token, then drains active requests',async()=>{
 const app=express();let server:any,drained=false,finishWork:()=>void=()=>{};
 const lifecycle=applicationLifecycle(()=>new Promise<void>(resolve=>server.close(()=>{drained=true;resolve();})));app.use('/api/application',lifecycle.router);app.use(lifecycle.gate);
 app.post('/work',(_req,res)=>{finishWork=()=>{if(!res.writableEnded)res.json({saved:true});};});server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
 try{
  const status=await (await fetch(url+'/api/application/status')).json();assert.equal(status.shutdown,true);
  for(const headers of [{'Content-Type':'application/json'},{'Content-Type':'application/json','X-RadContour':'local',Origin:'https://example.org'}])assert.equal((await fetch(url+'/api/application/shutdown',{method:'POST',headers,body:JSON.stringify({token:status.token})})).status,403);
  assert.equal((await fetch(url+'/api/application/shutdown',{method:'POST',headers:{'Content-Type':'application/json','X-RadContour':'local'},body:JSON.stringify({token:'wrong'})})).status,403);
  const work=fetch(url+'/work',{method:'POST'});await new Promise(r=>setTimeout(r,100));
  const ack=await fetch(url+'/api/application/shutdown',{method:'POST',headers:{'Content-Type':'application/json','X-RadContour':'local'},body:JSON.stringify({token:status.token})});assert.equal(ack.status,200);assert.deepEqual(await ack.json(),{stopping:true});assert.equal(drained,false);finishWork();assert.deepEqual(await (await work).json(),{saved:true});
  for(let i=0;i<500&&!drained;i++)await new Promise(r=>setTimeout(r,20));assert.equal(drained,true);
 }finally{finishWork();server.closeAllConnections();server.close();}
});

test('production Node process exits after acknowledged UI shutdown and removes its own PID marker',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-shutdown-'));await fs.mkdir(path.join(root,'runtime'));await fs.mkdir(path.join(root,'dist'));await fs.writeFile(path.join(root,'dist','index.html'),'synthetic');
 const child=spawn(process.execPath,[path.resolve('server/main.mjs')],{cwd:root,env:{...process.env,PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});const exited=once(child,'exit');let output='';
 try{
  const url=await new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timed out: '+output)),10000);child.stdout.on('data',b=>{output+=b;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.once('error',reject);});
  await fs.writeFile(path.join(root,'runtime','server.pid'),String(child.pid));const status=await (await fetch(url+'/api/application/status')).json();
  const r=await fetch(url+'/api/application/shutdown',{method:'POST',headers:{'Content-Type':'application/json','X-RadContour':'local'},body:JSON.stringify({token:status.token})});assert.equal(r.status,200);await r.json();
  const timeout=setTimeout(()=>child.kill(),10000);const [code,signal]=await exited;clearTimeout(timeout);assert.equal(code,0);assert.equal(signal,null);await assert.rejects(fs.access(path.join(root,'runtime','server.pid')));
 }finally{if(child.exitCode===null)child.kill();}
});

import {promises as fs} from 'node:fs';import {spawn} from 'node:child_process';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import net from 'node:net';
const original=path.resolve(process.argv[2] || ''),metadata=JSON.parse(await fs.readFile(path.join(original,'release.json'),'utf8'));
assert.equal(metadata.platform,(process.platform==='win32'?'win':process.platform)+'-'+process.arch,'Run on the matching native OS/architecture');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'IVCS RT portable test '));await fs.cp(original,root,{recursive:true});
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
const child=spawn(path.join(root,'runtime',process.platform==='win32'?'node.exe':'node'),[path.join(root,'server.cjs')],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});
let spawnError;child.on('error',e=>spawnError=e);
try{
 let index;for(let i=0;i<100;i++){if(spawnError)throw spawnError;try{const r=await fetch(`http://127.0.0.1:${port}/api/library`);if(r.ok){index=await r.json();break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal(index?.patients.length,1);assert.equal(index.patients[0].id,'SYNTHETIC-LB-20260909');
 assert.match(await (await fetch(`http://127.0.0.1:${port}/`)).text(),/IVCS RT/);
 const response=await fetch(`http://127.0.0.1:${port}/api/library/study/${index.patients[0].studies[0].key}`,{headers:{Accept:'application/x-ndjson'}});
 assert.match(response.headers.get('content-type'),/ndjson/);assert.match(await response.text(),/"kind":"end"/);
 metadata.nativeExecutionTested=true;metadata.nativeTest={scope:'Bundled runtime, local server, relocated synthetic library and streamed image API',platform:process.platform,architecture:process.arch,date:new Date().toISOString()};
 await fs.writeFile(path.join(original,'release.json'),JSON.stringify(metadata,null,2));console.log('PASS native portable:',metadata.platform);
}finally{child.kill();await new Promise(r=>{if(child.exitCode!==null || spawnError)return r();child.once('exit',r);});assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('IVCS RT portable test '));await fs.rm(root,{recursive:true,force:true});}

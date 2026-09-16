import {spawn} from 'node:child_process';
import {openSync,closeSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
const root=path.dirname(process.argv[1]),runtime=path.join(root,'runtime'),node=path.join(runtime,process.platform==='win32'?'node.exe':'node');
const port=Number(process.env.PORT || 3210);if(!Number.isInteger(port) || port<1024 || port>65535)throw new Error('Invalid PORT');
const url='http://127.0.0.1:'+port;
async function identify(){try{const r=await fetch(url+'/api/library',{signal:AbortSignal.timeout(600)});return r.ok?await r.json():null;}catch{return null;}}
function browser(){const command=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';const args=process.platform==='win32'?['/c','start','',url]:[url];const child=spawn(command,args,{detached:true,windowsHide:true,stdio:'ignore'});child.on('error',()=>console.log('Open '+url+' in your browser.'));child.unref();}
const running=await identify(),ours=running?.folder && path.resolve(running.folder)===path.join(root,'data');
if(process.argv[2]==='stop'){
 if(!ours){console.log('This IVCS RT instance is not running at '+url);process.exit(0);}
 const pid=Number(readFileSync(path.join(runtime,'server.pid'),'utf8'));if(!Number.isInteger(pid) || pid<=0)throw new Error('Invalid process identifier');
 process.kill(pid);console.log('IVCS RT stopped.');
}else{
 if(ours){browser();process.exit(0);}
 await new Promise((resolve,reject)=>{const test=net.createServer();test.once('error',()=>reject(new Error('Port '+port+' is occupied. Close the other application first.')));test.listen(port,'127.0.0.1',()=>test.close(resolve));});
 const out=openSync(path.join(runtime,'server.log'),'a'),err=openSync(path.join(runtime,'error.log'),'a');
 const child=spawn(node,[path.join(root,'server.cjs')],{cwd:root,env:{...process.env,PORT:String(port)},detached:true,windowsHide:true,stdio:['ignore',out,err]});child.on('error',e=>console.error(e.message));child.unref();closeSync(out);closeSync(err);
 for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,200));const status=await identify();if(status?.folder && path.resolve(status.folder)===path.join(root,'data')){console.log('IVCS RT: '+url);browser();process.exit(0);}}
 throw new Error('IVCS RT did not start. See runtime/error.log.');
}

import express from 'express';
import path from 'node:path';
import {writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {applicationLifecycle} from './application.mjs';
import { libraryRouter } from './library.mjs';

const root=process.cwd();
const app=express();
let server;
const lifecycle=applicationLifecycle(()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();}));
app.use('/api/application',lifecycle.router);
app.use(lifecycle.gate);
app.use('/api/library',libraryRouter(path.join(root,'data')));
app.use(express.static(path.join(root,'dist')));
app.get('*',(_req,res)=>res.sendFile(path.join(root,'dist','index.html')));
const port=Number(process.env.PORT || 3000);
server=app.listen(port,'127.0.0.1',()=> {
  if(path.dirname(process.execPath)===path.join(root,'runtime'))writeFileSync(path.join(root,'runtime','server.pid'),String(process.pid));
  console.log(`IVCS RT local: http://127.0.0.1:${server.address().port} — datos: ${path.join(root,'data')}`);
});

// Remove only this process's PID file; never remove a replacement server's marker.
process.on('exit',()=>{const file=path.join(root,'runtime','server.pid');try{if(readFileSync(file,'utf8').trim()===String(process.pid))unlinkSync(file);}catch{}});

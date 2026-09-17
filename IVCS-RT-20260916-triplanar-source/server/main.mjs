import express from 'express';
import path from 'node:path';
import {writeFileSync} from 'node:fs';
import { libraryRouter } from './library.mjs';

const root=process.cwd();
const app=express();
app.use('/api/library',libraryRouter(path.join(root,'data')));
app.use(express.static(path.join(root,'dist')));
app.get('*',(_req,res)=>res.sendFile(path.join(root,'dist','index.html')));
const port=Number(process.env.PORT || 3000);
app.listen(port,'127.0.0.1',()=> {
  if(path.dirname(process.execPath)===path.join(root,'runtime'))writeFileSync(path.join(root,'runtime','server.pid'),String(process.pid));
  console.log(`IVCS RT local: http://127.0.0.1:${port} — datos: ${path.join(root,'data')}`);
});

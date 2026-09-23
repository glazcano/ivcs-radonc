import express from 'express';
import {randomUUID} from 'node:crypto';
/** Explicit local shutdown only. Never tie process lifetime to a browser unload event. */
export function applicationLifecycle(stop){
 const token=randomUUID(),router=express();let stopping=false;
 router.use((req,res,next)=>{
  if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'') || (req.headers.origin && req.headers.origin!==`http://${req.headers.host}`))return res.status(403).end();
  res.setHeader('Cache-Control','no-store');next();
 });
 router.get('/status',(_req,res)=>res.json({application:'IVCS RT',shutdown:true,token,stopping}));
 router.post('/shutdown',express.json({limit:'1kb'}),(req,res)=>{
  if(req.headers['x-radcontour']!=='local'||req.body?.token!==token)return res.status(403).json({error:'Invalid shutdown request.'});
  if(stopping)return res.status(409).json({error:'Server shutdown is already in progress.'});
  stopping=true;
  // Send acknowledgment before closing the listener. Existing requests finish normally.
  res.once('finish',()=>{setImmediate(()=>{Promise.resolve(stop()).catch(error=>console.error('Shutdown failed:',error));});});
  res.json({stopping:true});
 });
 return {router,gate:(req,res,next)=>stopping?res.status(503).json({error:'IVCS RT is shutting down.'}):next()};
}

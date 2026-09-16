import {readDicomDataset,acquisitionToken} from '../src/utils/dicomDataset.mjs';
import {readTranslations} from './translations.mjs';
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import JSZip from 'jszip';
import dicomParser from 'dicom-parser';

const keyOf = value => createHash('sha256').update(value).digest('hex');
const empty = () => ({version:1, patients:[], latest:null});
const text = value => typeof value === 'string' && value.trim().length > 0;

export function createLibrary(root) {
  const indexFile=path.join(root,'index.json');
  let queue=Promise.resolve();
  // Keep public identifiers stable; only physical directory names change.
  let layoutReady;
  const compactFolder=key=>path.join(root,'s',key.slice(0,24));
  const migrate=async index=>{
    const entries=[...index.patients,...(index.trash || []).map(t=>t.patient)];
    const seen=new Map();
    for(const patient of entries)for(const study of patient.studies){
      if(!/^[a-f0-9]{64}$/.test(study.key) || !/^[a-f0-9]{64}$/.test(patient.key))throw new Error('Identificador de almacenamiento inválido.');
      const short=study.key.slice(0,24);
      if(seen.has(short) && seen.get(short)!==study.key)throw new Error('Colisión de directorios de almacenamiento.');
      seen.set(short,study.key);
      const old=path.join(root,'patients',patient.key,'studies',study.key),next=compactFolder(study.key);
      const exists=await fs.access(old).then(()=>true,()=>false);
      if(exists){
        if(await fs.access(next).then(()=>true,()=>false))throw new Error('Existen dos carpetas para la misma serie; no se sobrescribieron datos.');
        await fs.mkdir(path.dirname(next),{recursive:true});
        // Same-volume rename is atomic. On interruption, the unchanged index resolves the new path.
        await fs.rename(old,next);
        await fs.rmdir(path.dirname(old)).catch(()=>{});await fs.rmdir(path.dirname(path.dirname(old))).catch(()=>{});
      }
    }
  };
  const read=async()=> {let index;try {index=JSON.parse(await fs.readFile(indexFile,'utf8'));} catch(e) {if(e.code==='ENOENT')return empty();throw e;}
    await (layoutReady ||= migrate(index).catch(e=>{layoutReady=undefined;throw e;}));return index;};
  const atomic=async(file,bytes)=> {
    await fs.mkdir(path.dirname(file),{recursive:true});
    const tmp=path.join(path.dirname(file),'.tmp-'+randomUUID().replaceAll('-','').slice(0,16));
    await fs.writeFile(tmp,bytes);await fs.rename(tmp,file);
  };
  const commit=async index=>atomic(indexFile,JSON.stringify(index,null,2));
  /** @template T @param {()=>Promise<T>} fn @returns {Promise<T>} */
  const mutate=fn=> {const next=queue.catch(()=>{}).then(fn);queue=next.then(()=>{},()=>{});return next;};
  const locate=(index,key)=> {
    for(const patient of index.patients) {const study=patient.studies.find(s=>s.key===key);if(study)return {patient,study};}
    throw Object.assign(new Error('Estudio no encontrado.'),{status:404});
  };
  const folder=(_patient,study)=>compactFolder(study.key);
  const readState=async(patient,study,hydrate=true)=> {
    if(!study.state)return null;
    const state=JSON.parse(gunzipSync(await fs.readFile(path.join(folder(patient,study),study.state))));
    if(hydrate)for(const roi of state.rois)for(const [z,mask] of Object.entries(roi.sliceMasks || {}))if(mask?.maskFile){
      if(!/^[a-f0-9]{64}$/.test(mask.maskFile))throw new Error('Referencia de máscara inválida.');
      roi.sliceMasks[z]=JSON.parse(gunzipSync(await fs.readFile(path.join(folder(patient,study),'masks',mask.maskFile+'.json.gz'))));
    }
    return state;
  };
  return {
    root,
    settings:async()=>{try{return JSON.parse(await fs.readFile(path.join(root,'preferences.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}},
    saveSettings:value=>mutate(async()=>{if(!value || typeof value!=='object' || JSON.stringify(value).length>200000)throw new Error('Preferencias inválidas.');let old={};try{old=JSON.parse(await fs.readFile(path.join(root,'preferences.json'),'utf8'));}catch{}await atomic(path.join(root,'preferences.json'),JSON.stringify({...old,...value},null,2));return {saved:true};}),
    list:async()=>({...await read(),exists:await fs.access(indexFile).then(()=>true,()=>false),folder:root}),
    remove:payload=>mutate(async()=> {
      const index=await read();
      const patient=index.patients.find(p=>payload.kind==='patient'?p.key===payload.key:p.studies.some(s=>s.key===payload.key));
      if(!patient || !['patient','study'].includes(payload.kind))throw new Error('Paciente o estudio no encontrado.');
      const removed=payload.kind==='patient'?patient.studies:patient.studies.filter(s=>s.key===payload.key);
      const keys=new Set(removed.map(s=>s.key));
      // Keep bytes in place; one atomic manifest change makes deletion recoverable.
      index.trash ||= [];
      index.trash.push({id:randomUUID(),deletedAt:new Date().toISOString(),patient:{...patient,studies:removed}});
      patient.studies=patient.studies.filter(s=>!keys.has(s.key));
      patient.groups=patient.groups.filter(g=>!keys.has(g.referenceKey)).map(g=>({...g,members:g.members.filter(k=>!keys.has(k)),transforms:Object.fromEntries(Object.entries(g.transforms).filter(([k])=>!keys.has(k)))})).filter(g=>g.members.length>1);
      index.patients=index.patients.filter(p=>p.studies.length);
      if(keys.has(index.latest))index.latest=null;
      await commit(index);return {removed:removed.length};
    }),
    restore:id=>mutate(async()=> {
      const index=await read(),entry=index.trash?.find(t=>t.id===id);
      if(!entry)throw new Error('Elemento de papelera no encontrado.');
      let patient=index.patients.find(p=>p.key===entry.patient.key);
      if(!patient){patient={...entry.patient,studies:[],groups:[]};index.patients.push(patient);}
      if(entry.patient.studies.some(s=>patient.studies.some(e=>e.key===s.key)))throw new Error('La serie ya existe.');
      patient.studies.push(...entry.patient.studies);
      for(const group of entry.patient.groups)if(!patient.groups.some(g=>g.id===group.id) && group.members.every(k=>patient.studies.some(s=>s.key===k)))patient.groups.push(group);
      index.trash=index.trash.filter(t=>t.id!==id);await commit(index);return {restored:true};
    }),
    putStudy:study=>mutate(async()=> {
      if(!text(study.patientId) || !text(study.id) || !Array.isArray(study.slices) || !study.slices.length)throw new Error('Estudio sin ID de paciente o imágenes.');
      const index=await read(), patientKey=keyOf(study.patientId);
      let patient=index.patients.find(p=>p.id===study.patientId);
      if(!patient) {patient={key:patientKey,id:study.patientId,name:study.patientName || '',studies:[],groups:[]};index.patients.push(patient);}
      const key=keyOf(study.patientId+'\0'+(study.seriesInstanceUID || study.id)+(study.acquisitionKey?'\0'+study.acquisitionKey:''));
      if(index.trash?.some(t=>t.patient.studies.some(s=>s.key===key)))throw new Error('El estudio está en la papelera. Restáurelo desde la biblioteca antes de guardar o importar.');
      if([...index.patients,...(index.trash || []).map(t=>t.patient)].some(p=>p.studies.some(s=>s.key!==key && s.key.slice(0,24)===key.slice(0,24))))throw new Error('Colisión de directorios de almacenamiento.');
      const existing=patient.studies.find(s=>s.key===key);
      const bytes=Buffer.from(JSON.stringify(study));
      // Re-import is idempotent and must never replace existing contours.
      if(existing) {
        const original=JSON.parse(gunzipSync(await fs.readFile(path.join(folder(patient,existing),'images.json.gz'))));
        const signature=s=>JSON.stringify(s.slices.map(x=>[x.sopInstanceUID,x.rows,x.cols,x.imagePositionPatient,x.huData]));
        if(signature(original)!==signature(study))throw new Error('La serie ya existe con imágenes diferentes; no se reemplazó.');
        return {key};
      }
      const entry={key,id:study.id,acquisitionKey:study.acquisitionKey,seriesInstanceUID:study.seriesInstanceUID,studyInstanceUID:study.studyInstanceUID,description:study.seriesDescription || '',studyDescription:study.studyDescription || '',modality:study.modality,date:study.studyDate || study.date || '',slices:study.slices.length,state:null,originals:0};
      await atomic(path.join(folder(patient,entry),'images.json.gz'),gzipSync(bytes));
      patient.studies.push(entry);patient.name=study.patientName || patient.name;
      await commit(index);return {key};
    }),
    save:payload=>mutate(async()=> {
      const index=await read(), {patient,study}=locate(index,payload.key);
      if('expectedRevision' in payload && payload.expectedRevision!==study.state)throw Object.assign(new Error('Otra ventana guardó una versión más reciente. Exporte su sesión JSON y vuelva a abrir el estudio antes de guardar.'),{status:409});
      const keys=payload.studyKeys;
      if(!Array.isArray(keys) || !keys.includes(study.key) || keys.some(k=>!patient.studies.some(s=>s.key===k)))throw new Error('Las imágenes deben pertenecer al mismo paciente.');
      if(!payload.state || !Array.isArray(payload.state.rois))throw new Error('Sesión inválida.');
      const previous=await readState(patient,study,false);
      const state={...payload.state,rois:[]};
      for(const roi of payload.state.rois){
        const masks={};
        for(const [z,value] of Object.entries(roi.sliceMasks || {})){
          let mask=value;
          if(mask?.unchanged){mask=previous?.rois.find(r=>r.id===roi.id)?.sliceMasks?.[z];if(!mask)throw new Error('La máscara base ya no existe.');}
          if(mask?.maskFile){masks[z]=mask;continue;}
          const bytes=Buffer.from(JSON.stringify(mask)),hash=keyOf(bytes),file=path.join(folder(patient,study),'masks',hash+'.json.gz');
          try{await fs.access(file);}catch{await atomic(file,gzipSync(bytes));}
          masks[z]={maskFile:hash};
        }
        state.rois.push({...roi,sliceMasks:masks});
      }
      const name='state-'+randomUUID()+'.json.gz';
      await atomic(path.join(folder(patient,study),name),gzipSync(Buffer.from(JSON.stringify({...state,studyKeys:keys}))));
      const expired=study.previousState;
      study.previousState=study.state;study.state=name;study.updatedAt=new Date().toISOString();index.latest=study.key;
      await commit(index);
      if(expired && /^state-[a-f0-9-]+\.json\.gz$/.test(expired))await fs.unlink(path.join(folder(patient,study),expired)).catch(()=>{});
      // Retain only masks referenced by the two committed revisions. Cleanup cannot fail the save.
      try {
        const used=new Set();
        for(const revision of [study.state,study.previousState].filter(Boolean)){
          const retained=JSON.parse(gunzipSync(await fs.readFile(path.join(folder(patient,study),revision))));
          for(const roi of retained.rois)for(const m of Object.values(roi.sliceMasks || {}))if(m?.maskFile)used.add(m.maskFile);
        }
        const dir=path.join(folder(patient,study),'masks');
        for(const file of await fs.readdir(dir))if(/^[a-f0-9]{64}\.json\.gz$/.test(file) && !used.has(file.slice(0,64)))await fs.unlink(path.join(dir,file));
      }catch{}
      return {saved:true,revision:name};
    }),
    open:async(key,selectedOnly=false)=> {
      const index=await read(), {patient,study}=locate(index,key);
      const assets=async entry=>JSON.parse(gunzipSync(await fs.readFile(path.join(folder(patient,entry),'images.json.gz'))));
      const state=await readState(patient,study);
      const selected=await assets(study);
      // All series of this patient are available to the registration assistant.
      const studies=selectedOnly?[selected]:await Promise.all(patient.studies.map(s=>s.key===key?Promise.resolve(selected):assets(s)));
      if(state?.registrationState){
        const r=state.registrationState,ids=new Set(patient.studies.map(s=>s.id));
        if(!ids.has(r.secondaryStudyId)){r.secondaryStudyId=selected.id;r.active=false;}
        r.transforms=Object.fromEntries(Object.entries(r.transforms || {}).filter(([id])=>ids.has(id)));
      }
      return {selected,studies,state,revision:study.state};
    },
    exportOriginals:async(key)=> {
      const {patient,study}=locate(await read(),key),dir=path.join(folder(patient,study),'dicom'),zip=new JSZip();
      const names=await fs.readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
      for(const name of names)if(/^[a-f0-9]{64}\.dcm$/.test(name))zip.file(name,await fs.readFile(path.join(dir,name)));
      if(!Object.keys(zip.files).length)throw new Error('Este estudio no tiene DICOM originales archivados.');
      return zip.generateAsync({type:'nodebuffer',compression:'STORE'});
    },
    group:payload=>mutate(async()=> {
      const index=await read(), {patient,study}=locate(index,payload.referenceKey);
      const secondary=patient.studies.find(s=>s.key===payload.secondaryKey);
      if(!secondary || secondary.key===study.key)throw new Error('Seleccione dos series del mismo paciente.');
      const transform=payload.transform;
      if(transform?.model==='rigid3d' && (transform.scaleX!==1 || transform.scaleY!==1 || transform.center?.length!==3 || ![transform.rotationX,transform.rotationY,...(transform.center || [])].every(Number.isFinite)))throw new Error('Transformación rígida 3D inválida.');
      if(!transform || !['translationX','translationY','translationZ','rotationDeg','scaleX','scaleY'].every(k=>Number.isFinite(transform[k])) || transform.scaleX<=0 || transform.scaleY<=0)throw new Error('Transformación inválida.');
      let group=patient.groups.find(g=>g.referenceKey===study.key);
      if(!group) {group={id:randomUUID(),referenceKey:study.key,label:`Grupo ${patient.groups.length+1}`,color:`hsl(${Math.round(patient.groups.length*137.508)%360} 75% 65%)`,members:[study.key],transforms:{}};patient.groups.push(group);}
      if(!group.members.includes(secondary.key))group.members.push(secondary.key);
      group.transforms[secondary.key]=transform;await commit(index);return group;
    }),
    originals:(patientId,bytes,name)=>mutate(async()=> {
      const index=await read(),patient=index.patients.find(p=>p.id===patientId);
      if(!patient)throw new Error('Paciente no encontrado.');
      const files=[];
      if(name.toLowerCase().endsWith('.zip')) {
        const zip=await JSZip.loadAsync(bytes);
        for(const entry of Object.values(zip.files))if(!entry.dir)files.push({name:entry.name,bytes:await entry.async('nodebuffer')});
      } else files.push({name,bytes});
      const planned=[];
      for(const file of files) {
        let ds;try{ds=readDicomDataset(new Uint8Array(file.bytes),{untilTag:'x7fe00010'});}catch{continue;}
        const el=ds.elements.x00100020, charset=ds.string('x00080005')?.trim();const dicomId=el?new TextDecoder(charset==='ISO_IR 192'?'utf-8':'iso-8859-1').decode(ds.byteArray.subarray(el.dataOffset,el.dataOffset+el.length)).replace(/[\0 ]+$/g,''):'';
        if(dicomId!==patientId)throw new Error('DICOM de un paciente distinto.');
        const candidates=patient.studies.filter(s=>s.seriesInstanceUID===ds.string('x0020000e'));
        const study=candidates.find(s=>s.acquisitionKey===acquisitionToken(ds)) || candidates.find(s=>!s.acquisitionKey);
        if(!study)throw new Error('Serie DICOM no importada en la biblioteca.');
        planned.push({study,file});
      }
      if(!planned.length)throw new Error('No se encontraron originales DICOM.');
      for(const {study,file} of planned) {
        const dir=path.join(folder(patient,study),'dicom');
        await atomic(path.join(dir,keyOf(file.bytes)+'.dcm'),file.bytes);
        study.originals=(await fs.readdir(dir)).filter(n=>n.endsWith('.dcm')).length;
      }
      await commit(index);return {saved:planned.length};
    })
  };
}

export function libraryRouter(root) {
  const library=createLibrary(root), router=express();
  // The application is local-only. Reject browser requests from other origins.
  router.use((req,res,next)=> {
    const origin=req.headers.origin;
    if(origin && origin!==`http://${req.headers.host}`)return res.status(403).json({error:'Origen no permitido.'});
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || ''))return res.status(403).end();
    if(!['GET','HEAD'].includes(req.method) && req.headers['x-radcontour']!=='local')return res.status(403).end();
    next();
  });
  const run=fn=>async(req,res)=>{try {res.json(await fn(req));}catch(e){res.status(e.status || 400).json({error:e.message});}};
  router.get('/',run(()=>library.list()));
  router.get('/translations',run(()=>readTranslations()));
  router.get('/settings',run(()=>library.settings()));
  router.get('/study/:key',run(req=>library.open(req.params.key,true)));
  router.get('/export/:key',run(req=>library.open(req.params.key,true)));
  router.get('/originals/:key',async(req,res)=>{try{res.type('application/zip').send(await library.exportOriginals(req.params.key));}catch(e){res.status(400).json({error:e.message});}});
  router.put('/originals',express.raw({type:'application/octet-stream',limit:'1gb'}),run(req=>library.originals(String(req.query.patientId),req.body,String(req.query.name))));
  router.use(express.json({limit:'1gb'}));
  router.post('/study',run(req=>library.putStudy(req.body)));
  router.put('/settings',run(req=>library.saveSettings(req.body)));
  router.put('/session',run(req=>{if(!('expectedRevision' in req.body))throw new Error('Recargue la aplicación antes de guardar: versión de cliente antigua.');return library.save(req.body);}));
  router.post('/group',run(req=>library.group(req.body)));
  router.post('/remove',run(req=>library.remove(req.body)));
  router.post('/restore',run(req=>library.restore(req.body.id)));
  return router;
}

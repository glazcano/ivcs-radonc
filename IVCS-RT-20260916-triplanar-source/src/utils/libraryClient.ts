import {identity3d,volumeCenter} from './rigid3d';
import {readStudyStream} from './studyStream';
import type { Session } from './session';
import type { ImageStudy, RegistrationState } from '../types';

export interface LibraryStudy { acquisitionDimensions?:Record<string,string>;frameOfReferenceUID?:string;sourceSeriesUID?:string;seriesInstanceUID?:string;studyInstanceUID?:string;key:string; id:string; description:string; studyDescription:string; modality:string; date:string; slices:number; originals:number; state:string|null; }
export interface LibraryGroup {relationPolicies?:RegistrationState['relationPolicies'];detachedSeriesIds?:string[];id:string;label:string;color:string;referenceKey:string;members:string[];transforms:Record<string,any>;}
export interface LibraryPatient {key:string;id:string;name:string;studies:LibraryStudy[];groups:LibraryGroup[];}
export interface LibraryIndex {version:number;patients:LibraryPatient[];latest:string|null;folder:string;exists?:boolean;trash?:{id:string;deletedAt:string;patient:LibraryPatient}[];}
const known=new WeakMap<object,string>();
const revisions=new WeakMap<object,string|null>();
const baselines=new WeakMap<object,Session['rois']>();

export function encodeLibrary(value:unknown):string {
  return JSON.stringify(value,(_key,v)=> {
    if(v instanceof Int16Array || v instanceof Float32Array || v instanceof Uint8Array) {
      const bytes=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);let binary='';
      for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return {array:v instanceof Int16Array?'i16':v instanceof Float32Array?'f32':'u8',base64:btoa(binary)};
    }
    return v;
  });
}
export function decodeLibrary(text:string):any {
  return JSON.parse(text,(_key,v)=> {
    if(v && (v.array==='i16' || v.array==='f32' || v.array==='u8') && typeof v.base64==='string') {
      const native=(Uint8Array as any).fromBase64;
      let bytes:Uint8Array;
      if(typeof native==='function')bytes=native.call(Uint8Array,v.base64);
      else {const binary=atob(v.base64);bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);}
      return v.array==='i16'?new Int16Array(bytes.buffer):v.array==='f32'?new Float32Array(bytes.buffer):bytes;
    }
    return v;
  });
}
async function request(url:string,method='GET',body?:unknown):Promise<any> {
  const response=await fetch('/api/library'+url,{method,headers:{'Content-Type':'application/json','X-RadContour':'local',...(/^\/(study|export)\//.test(url)?{'Accept':'application/x-ndjson'}:{})},body:body===undefined?undefined:encodeLibrary(body)});
  if(response.ok && response.headers.get('content-type')?.includes('application/x-ndjson'))return readStudyStream(response,decodeLibrary);
  const content=await response.text();
  if(!response.ok) {let error='No se pudo acceder a la biblioteca local.';try{error=JSON.parse(content).error || error;}catch{}throw new Error(error);}
  return decodeLibrary(content);
}
export const libraryIndex=():Promise<LibraryIndex>=>request('/');
export const getPreferences=()=>request('/settings');
export const savePreferences=(value:unknown)=>request('/settings','PUT',value);
export const removeLibraryEntry=(kind:'patient'|'study',key:string)=>request('/remove','POST',{kind,key});
export const restoreLibraryEntry=(id:string)=>request('/restore','POST',{id});
export const readExportStudy=(key:string)=>request('/export/'+encodeURIComponent(key));
export async function loadSecondaryStudy(key:string):Promise<ImageStudy>{const {selected}=await readExportStudy(key);known.set(selected,key);return selected;}
export async function registerStudy(study:ImageStudy):Promise<string> {
  const cached=known.get(study);if(cached)return cached;
  const result=await request('/study','POST',study);known.set(study,result.key);return result.key;
}
export function defaultRegistration(reference:string,secondary=reference):RegistrationState {
  return {active:false,referenceStudyId:reference,secondaryStudyId:secondary,transforms:{},fusionMode:'blend',fusionOpacity:0.5,checkerboardSize:32,splitPosition:0.5,secondaryColorMap:'grayscale',secondaryWindowCenter:120,secondaryWindowWidth:240,voi:{enabled:false,minX:0,maxX:1,minY:0,maxY:1,minSlice:0,maxSlice:0},showVoiOverlay:false};
}
export async function openLibraryStudy(key:string):Promise<Session> {
  const {selected,studies,state,revision}=await request('/study/'+encodeURIComponent(key));
  const index=await libraryIndex();
  const patient=index.patients.find(p=>p.studies.some(s=>s.key===key))!;
  for(const s of studies) {const entry=patient.studies.find(e=>e.id===s.id);if(entry)known.set(s,entry.key);}
  const reference=studies.find(s=>s.id===selected.id)!;
  revisions.set(reference,revision);baselines.set(reference,state?.rois || []);
  if(state?.registrationState && Object.values(state.registrationState.transforms || {}).some((t:any)=>t.model!=='rigid3d')){state.registrationState.active=false;state.registrationState.transforms={};}
  if(state?.registrationState?.active){const secondary=patient.studies.find(s=>s.id===state.registrationState.secondaryStudyId);if(secondary && secondary.key!==key)studies.push(await loadSecondaryStudy(secondary.key));}
  // Preserve per-series contours; never transfer a mask onto another reference grid.
  return {format:'radcontour-session',version:1,series:reference,studies,
    rois:[{id:'roi-'+key,name:'PTV',type:'PTV',color:'#ef4444',visible:true,locked:false,opacity:0.45,sliceMasks:{}}],currentSliceIndex:Math.floor(reference.slices.length/2),activeRoiId:'roi-'+key,windowCenter:reference.slices[0].windowCenter,windowWidth:reference.slices[0].windowWidth,
    registrationState:defaultRegistration(reference.id,studies.find(s=>s.id!==reference.id)?.id),...state};
}
export async function saveLibrarySession(session:Session):Promise<void> {
  const reference=session.studies.find(s=>s.id===session.registrationState.referenceStudyId);
  if(reference)for(const key of ['studyInstanceUID','seriesInstanceUID','frameOfReferenceUID','patientBirthDate','patientSex','studyDate','studyTime','accessionNumber']) {
    if(reference[key]===undefined && session.series[key]!==undefined)reference[key]=session.series[key];
  }
  const studyKeys=[];
  for(const study of session.studies)studyKeys.push(await registerStudy(study));
  const ref=session.studies.find(s=>s.id===session.registrationState.referenceStudyId);
  if(!ref || ref.slices[0]?.id!==session.series.slices[0]?.id)throw new Error('La serie de referencia no coincide con el caso abierto.');
  const {series,studies,...state}=session;
  const baseline=baselines.get(ref);
  const incremental={...state,rois:state.rois.map(roi=>({...roi,sliceMasks:Object.fromEntries(Object.entries(roi.sliceMasks).map(([z,mask])=>[z,baseline?.find(r=>r.id===roi.id)?.sliceMasks[z]===mask?{unchanged:true}:mask]))}))};
  const result=await request('/session','PUT',{key:known.get(ref),studyKeys,state:incremental,expectedRevision:revisions.get(ref) ?? null});
  revisions.set(ref,result.revision);baselines.set(ref,session.rois);
}
export async function archiveOriginals(patientId:string,files:File[]):Promise<void> {
  for(const file of files) {
    const response=await fetch('/api/library/originals?'+new URLSearchParams({patientId,name:file.name}),{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-RadContour':'local'},body:file});
    if(!response.ok)throw new Error((await response.json()).error || 'No se pudieron conservar los DICOM originales.');
  }
}
export async function saveRegistrationGroup(session:Session):Promise<void> {
  const r=session.registrationState;
  const ref=session.studies.find(s=>s.id===r.referenceStudyId),sec=session.studies.find(s=>s.id===r.secondaryStudyId);
  if(!ref || !sec || ref===sec)throw new Error('Seleccione una imagen secundaria para guardar el corregistro.');
  const index=await libraryIndex(),patient=index.patients.find(p=>p.id===ref.patientId);
  const entries=Object.entries(r.transforms).filter(([id,t])=>id!==ref.id && t.model==='rigid3d').map(([id,transform])=>({secondaryKey:patient?.studies.find(s=>s.id===id)?.key,transform}));
  if(entries.some(e=>!e.secondaryKey))throw new Error('Una serie vinculada ya no existe en la biblioteca.');
  if(!entries.some(e=>e.secondaryKey===patient?.studies.find(s=>s.id===sec.id)?.key))entries.push({secondaryKey:await registerStudy(sec),transform:identity3d(volumeCenter(sec))});
  await request('/group','POST',{referenceKey:await registerStudy(ref),entries,detachedSeriesIds:r.detachedSeriesIds || [],relationPolicies:r.relationPolicies || {}});
}
export function filterPatients(patients:LibraryPatient[],query:string):LibraryPatient[] {
  const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/\^/g,' ');
  const tokens=normalize(query).split(/\s+/).filter(Boolean);
  const compact=(s:string)=>s.replace(/[^\p{L}\p{N}]/gu,'');
  return patients.filter(p=>{const hay=normalize([p.id,p.name,...p.studies.flatMap(s=>[s.modality,s.description,s.studyDescription,s.date])].join(' '));return tokens.every(t=>hay.includes(t) || (!!compact(t) && compact(hay).includes(compact(t))));});
}

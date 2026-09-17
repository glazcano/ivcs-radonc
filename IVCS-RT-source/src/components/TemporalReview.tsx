import React,{useEffect,useRef,useState} from 'react';
import type {DicomSeries,StructureRoi} from '../types';
import {libraryIndex,loadSecondaryStudy,readExportStudy,LibraryStudy} from '../utils/libraryClient';
import {temporalLabel,temporalPeers,temporalPlane,combineTemporalPlanes,unionPhaseMasks} from '../utils/temporal';
import {tr} from '../i18n';
export function TemporalReview({series,sliceIndex,center,width,rois,onUnion,onClose,onOpen}:{series:DicomSeries;sliceIndex:number;center:number;width:number;rois:StructureRoi[];onUnion:(roi:StructureRoi)=>void;onClose:()=>void;onOpen:(key:string)=>Promise<void>}){
 const [entries,setEntries]=useState<LibraryStudy[]>([]),[keys,setKeys]=useState<string[]>([]),[phase,setPhase]=useState(0),[playing,setPlaying]=useState(false),[fps,setFps]=useState(2),[mode,setMode]=useState<'phase'|'MIP'|'AIP'>('phase'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[z,setZ]=useState(sliceIndex);
 const [compare,setCompare]=useState(false),comparison=useRef<HTMLCanvasElement>(null);
 const [roiName,setRoiName]=useState(rois[0]?.name || '');
 const canvas=useRef<HTMLCanvasElement>(null),cache=useRef(new Map<string,DicomSeries>()),request=useRef(0);
 useEffect(()=>{let alive=true;libraryIndex().then(index=>{if(!alive)return;const list=index.patients.find(p=>p.id===series.patientId)?.studies.filter(e=>(!e.frameOfReferenceUID || e.frameOfReferenceUID===series.frameOfReferenceUID) && e.modality===series.modality) || [];setEntries(list);setKeys(temporalPeers(series,list).map(e=>e.key));}).catch(e=>alive&&setError(e.message));return()=>{alive=false;request.current++;cache.current.clear();};},[series]);
 useEffect(()=>{const stop=()=>{if(document.hidden)setPlaying(false);};document.addEventListener('visibilitychange',stop);return()=>document.removeEventListener('visibilitychange',stop);},[]);
 useEffect(()=>{if(!playing || busy || keys.length<2 || mode!=='phase')return;const timer=setTimeout(()=>setPhase(v=>(v+1)%keys.length),1000/fps);return()=>clearTimeout(timer);},[playing,busy,phase,keys,fps,mode]);
 useEffect(()=>{
  const id=++request.current;let alive=true;setBusy(true);setError('');canvas.current?.getContext('2d')?.clearRect(0,0,canvas.current.width,canvas.current.height);
  const run=async()=>{
   if(!keys.length)return;let inverted=series.slices[z].inverted;const reference=series.slices[z],selected=mode==='phase'?[keys[phase] || keys[0]]:keys,planes=[];
   for(const key of selected){
    let image=cache.current.get(key);if(!image){image=await loadSecondaryStudy(key);if(!alive || id!==request.current)return;cache.current.set(key,image);const bytes=()=>[...cache.current.values()].reduce((sum,s)=>sum+[...s.slices,...(s.sourceVolume?.slices || [])].reduce((n,p)=>n+p.huData.byteLength+(p.valid?.byteLength || 0),0),0);while(cache.current.size>1 && (cache.current.size>2 || bytes()>256*1024*1024))cache.current.delete(cache.current.keys().next().value!);}
    if(image.patientId!==series.patientId || image.frameOfReferenceUID!==series.frameOfReferenceUID)throw new Error(tr('Las fases deben compartir paciente y marco DICOM.'));
    if(mode==='phase')inverted=image.slices[0].inverted;planes.push(temporalPlane(reference,image));await new Promise(resolve=>setTimeout(resolve,0));if(!alive || id!==request.current)return;
   }
   const result=mode==='phase'?planes[0]:combineTemporalPlanes(planes,mode),c=canvas.current;if(!c)return;c.width=reference.cols;c.height=reference.rows;const ctx=c.getContext('2d')!,out=ctx.createImageData(c.width,c.height);
   for(let i=0;i<result.values.length;i++){let v=result.valid[i]?Math.max(0,Math.min(255,Math.round((result.values[i]-center)/Math.max(1e-12,width)*255+127.5))):0;if(inverted && result.valid[i])v=255-v;out.data.set([v,v,v,255],i*4);}ctx.putImageData(out,0,0);
   if(result.valid.some(v=>!v))setError(tr('Cobertura incompleta: las regiones sin datos se muestran en negro.'));
  };run().catch(e=>{if(alive){setError(e.message);setPlaying(false);}}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};
 },[keys,phase,mode,series,z,center,width]);
 useEffect(()=>{
  if(!compare || !comparison.current)return;const s=series.slices[z],c=comparison.current;c.width=s.cols;c.height=s.rows;const ctx=c.getContext('2d')!,out=ctx.createImageData(c.width,c.height);
  for(let i=0;i<s.huData.length;i++){let v=Math.max(0,Math.min(255,Math.round((s.huData[i]-center)/Math.max(1e-12,width)*255+127.5)));if(s.inverted)v=255-v;if(s.valid && !s.valid[i])v=0;out.data.set([v,v,v,255],i*4);}ctx.putImageData(out,0,0);
 },[compare,series,z,center,width]);
 const makeUnion=async()=>{
  setPlaying(false);setBusy(true);setError('');const id=++request.current;
  try{
   const combined:Record<number,Uint8Array>={};let template:StructureRoi|undefined;
   for(const key of keys){
    const {selected:image,state}=await readExportStudy(key);if(id!==request.current)return;
    const current=image.seriesInstanceUID===series.seriesInstanceUID && image.acquisitionKey===series.acquisitionKey;
    const matches=(current?rois:state?.rois || []).filter((r:StructureRoi)=>r.name===roiName);
    if(matches.length!==1 || !Object.values(matches[0].sliceMasks).some((m:any)=>m.some((v:number)=>v)))throw new Error(tr('Cada fase debe tener exactamente una estructura no vacía con el nombre seleccionado. Guarde los contornos de las otras fases primero.'));
    template=matches[0];const masks=unionPhaseMasks(series,[{series:image,roi:template!}]);
    for(const [z,mask] of Object.entries(masks)){const dst=combined[z] ||= new Uint8Array(mask.length);for(let i=0;i<mask.length;i++)dst[i] ||= mask[i];}
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(template && id===request.current){onUnion({...template,id:crypto.randomUUID(),name:'ITV candidate · '+roiName,locked:false,sliceMasks:combined,volumeCm3:undefined});onClose();}
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const selected=entries.find(e=>e.key===keys[phase]);
 return <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label={tr('Revisión 4D')} className="bg-zinc-900 text-zinc-200 border border-zinc-600 rounded-lg w-full max-w-5xl max-h-[94vh] overflow-auto p-4 space-y-3 [&_select]:bg-zinc-800 [&_select]:p-1">
  <div className="flex justify-between"><h2>{tr('Revisión 4D')}</h2><button onClick={onClose}>{tr('Cerrar')}</button></div>
  <p className="text-xs text-zinc-400">{tr('Seleccione solo fases de la misma adquisición. La revisión conserva las coordenadas DICOM y el movimiento; no aplica corregistro. Abra una fase para editar sus propios contornos.')}</p>
  <details open={!keys.length}><summary className="cursor-pointer text-sm">{tr('Seleccionar y ordenar fases')} ({keys.length})</summary><div className="max-h-36 overflow-auto">{entries.map(e=><label key={e.key} className="flex gap-2 text-xs py-1"><input type="checkbox" checked={keys.includes(e.key)} onChange={event=>{setPlaying(false);setPhase(0);setKeys(event.target.checked?[...keys,e.key]:keys.filter(k=>k!==e.key));}}/>{e.description} · {e.slices} {tr('imágenes')}</label>)}</div><p className="text-xs text-zinc-400">{tr('El orden de selección define el orden de reproducción cuando no hay etiquetas temporales.')}</p></details>
  <div className="flex gap-3 flex-wrap items-center text-sm"><select aria-label={tr('Fase')} value={phase} onChange={e=>{setPlaying(false);setPhase(Number(e.target.value));}}>{keys.map((key,i)=><option key={key} value={i}>{i+1} · {temporalLabel(entries.find(e=>e.key===key)!)}</option>)}</select><button disabled={keys.length<2 || mode!=='phase'} onClick={()=>setPlaying(!playing)}>{playing?tr('Pausar'):tr('Reproducir')}</button><label>{tr('Velocidad')} <input aria-label={tr('Velocidad')} type="number" min={1} max={10} value={fps} className="w-12 bg-zinc-800" onChange={e=>setFps(Math.max(1,Math.min(10,Number(e.target.value)||1)))}/> fps</label><select aria-label={tr('Modo')} value={mode} onChange={e=>{setPlaying(false);setMode(e.target.value as typeof mode);}}><option value="phase">{tr('Fase')}</option><option>MIP</option><option>AIP</option></select><span>{busy?tr('Cargando…'):selected?.description}</span></div>
  <label className="text-xs flex gap-2"><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/>{tr("Comparar con imagen principal")}</label>
  <div className="flex gap-3 justify-center min-w-0">{compare && <div className="min-w-0 flex-1"><p className="text-xs">{tr("Imagen principal")}</p><canvas ref={comparison} className="w-full h-[45vh] object-contain bg-black"/></div>}<div className="min-w-0 flex-1"><canvas ref={canvas} className="block bg-black mx-auto max-w-full" style={{height:'45vh',aspectRatio:`${series.slices[z].cols*series.slices[z].pixelSpacing[1]}/${series.slices[z].rows*series.slices[z].pixelSpacing[0]}`,objectFit:'contain'}}/></div></div>
  <label className="flex gap-2 text-xs">{tr('Corte')} {z+1}<input aria-label={tr('Corte')} className="flex-1" type="range" min={0} max={series.slices.length-1} value={z} onChange={e=>setZ(Number(e.target.value))}/></label>
  {mode!=='phase' && <p className="text-amber-200 text-xs">{tr('Vista derivada temporal MIP/AIP. No es una imagen validada para cálculo de dosis ni se exporta desde esta vista.')}</p>}
  {error && <p role="status" className="text-amber-300 text-xs">{error}</p>}
  <div className="flex gap-2 items-center text-xs"><label>{tr('Estructura')} <select aria-label={tr('Estructura')} value={roiName} onChange={e=>setRoiName(e.target.value)}>{rois.map(r=><option key={r.id}>{r.name}</option>)}</select></label><button disabled={busy || keys.length<2 || !roiName} className="border border-zinc-600 rounded p-2 disabled:opacity-40" onClick={()=>void makeUnion()}>{tr('Crear candidato ITV por unión')}</button><span className="text-zinc-400">{tr('Requiere revisión. No propaga ni deforma contornos.')}</span></div>
  <div className="flex justify-end"><button disabled={!selected || busy} className="px-3 py-2 bg-blue-600 rounded disabled:opacity-40" onClick={()=>{setPlaying(false);void onOpen(selected!.key).then(onClose).catch(e=>setError(e.message));}}>{tr('Abrir fase para contouring')}</button></div>
 </section></div>;
}

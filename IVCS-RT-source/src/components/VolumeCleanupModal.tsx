import React,{useEffect,useRef,useState,useMemo} from 'react';
import type {DicomSeries,StructureRoi} from '../types';
import type {CleanupInput,CleanupResult} from '../utils/volumeCleanup';
import {voxelDepth} from '../utils/geometry';
import {DifferencePreview} from './MonacoExportModal';
import {tr} from '../i18n';

export function VolumeCleanupModal({series,roi,onClose,onApply}:{series:DicomSeries;roi:StructureRoi;onClose:()=>void;onApply:(result:StructureRoi,overwrite:boolean)=>void}){
 const [method,setMethod]=useState<CleanupInput['method']>('median'),[radius,setRadius]=useState(1.5),[minimum,setMinimum]=useState(0),[holes,setHoles]=useState(false);
 const [overwrite,setOverwrite]=useState(false),[name,setName]=useState(`${roi.name}_clean`),[accepted,setAccepted]=useState(false);
 const [result,setResult]=useState<CleanupResult|null>(null),[progress,setProgress]=useState<number|null>(null),[error,setError]=useState('');
 const worker=useRef<Worker|null>(null);
 const cancel=()=>{worker.current?.terminate();worker.current=null;setProgress(null);};
 useEffect(()=>()=>worker.current?.terminate(),[]);
 useEffect(()=>{cancel();setResult(null);setAccepted(false);},[method,radius,minimum,holes,roi,series]);
 const run=()=>{
  cancel();setResult(null);setAccepted(false);setError('');setProgress(0);
  try {
  const w=new Worker(new URL('../workers/cleanup.worker.ts',import.meta.url),{type:'module'});worker.current=w;
  w.onmessage=({data})=>{if(worker.current!==w)return;if(data.error){setError(data.error);cancel();}else if(data.result){setResult(data.result);cancel();}else setProgress(data.progress);};
  w.onerror=e=>{setError(e.message||tr('No se pudo calcular la limpieza.'));cancel();};
  const first=series.slices[0],valid:Record<number,Uint8Array>={};series.slices.forEach((s,z)=>{if(s.valid)valid[z]=s.valid;});
  w.postMessage({cols:first.cols,rows:first.rows,depth:series.slices.length,spacing:[first.pixelSpacing[1],first.pixelSpacing[0],voxelDepth(series.slices,first)],masks:roi.sliceMasks,valid,method,radiusMm:radius,minComponentMm3:minimum*1000,fillHoles:holes} satisfies CleanupInput);
  } catch(error){setError((error as Error).message);cancel();}
 };
 const firstChanged=useMemo(()=>{
  if(!result)return 0;
  const keys=[...new Set([...Object.keys(roi.sliceMasks),...Object.keys(result.masks)])].map(Number).sort((a,b)=>a-b);
  return keys.find(z=>{const a=roi.sliceMasks[z],b=result.masks[z];return (a||b).some((_,i)=>(a?.[i]||0)!==(b?.[i]||0));}) ?? keys.find(z=>(roi.sliceMasks[z]||result.masks[z]).some(Boolean)) ?? 0;
 },[result,roi]);
 const restored:StructureRoi={...roi,sliceMasks:result?.masks||{},volumeCm3:undefined};
 return <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label={tr('Suavizado y limpieza 3D')} className="bg-zinc-950 border border-zinc-700 rounded-lg p-4 w-full max-w-3xl max-h-[95vh] overflow-auto space-y-3">
  <div className="flex justify-between"><h2>{tr('Suavizado y limpieza 3D')} · {roi.name}</h2><button onClick={onClose}>{tr('Cerrar')}</button></div>
  <p className="text-xs text-zinc-400">{tr('Modifica la segmentación, no la imagen. Revise los cambios antes de aplicar; las estructuras finas pueden desaparecer.')}</p>
  <div className="grid grid-cols-2 gap-3 text-sm">
   <label>{tr('Método')}<select className="block w-full bg-zinc-800 p-1" value={method} onChange={e=>setMethod(e.target.value as CleanupInput['method'])}>{[['none','Solo limpieza'],['median','Mediana 3D'],['opening','Apertura: quitar protrusiones'],['closing','Cierre: rellenar pequeños huecos']].map(([v,label])=><option key={v} value={v}>{tr(label)}</option>)}</select></label>
   <label>{tr('Radio físico (mm)')}<input className="block bg-zinc-800 p-1 w-full" type="number" min="0.1" max="10" step="0.1" disabled={method==='none'} value={radius} onChange={e=>setRadius(Number(e.target.value))}/></label>
   <label>{tr('Eliminar componentes menores de (cm³)')}<input className="block bg-zinc-800 p-1 w-full" type="number" min="0" step="0.01" value={minimum} onChange={e=>setMinimum(Number(e.target.value))}/></label>
   <label><input type="checkbox" checked={holes} onChange={e=>setHoles(e.target.checked)}/> {tr('Rellenar cavidades cerradas en 3D')}</label>
  </div>
  <p className="text-xs text-zinc-400">{tr('El tamaño se expresa en milímetros y respeta el espaciado de cada eje. Con 0 cm³ se conservan todos los componentes. El relleno conserva cavidades comunicadas con el exterior.')}</p>
  <button data-testid="cleanup-preview" className="bg-blue-700 p-2 rounded disabled:opacity-40" onClick={run} disabled={progress!==null||!Number.isFinite(radius)||radius<=0||radius>10||!Number.isFinite(minimum)||minimum<0}>{tr('Calcular previsualización')}</button>
  {progress!==null&&<div role="status">{Math.round(progress)}% <button onClick={cancel}>{tr('Cancelar cálculo')}</button></div>}
  {error&&<p role="alert" className="text-red-300">{tr(error)}</p>}
  {result&&<><p data-testid="cleanup-summary">{tr('Volumen (cm³): {0} → {1}',[(result.before*result.voxelMm3/1000).toFixed(3),(result.after*result.voxelMm3/1000).toFixed(3)])}</p><p className="text-xs">{tr('Vóxeles añadidos: {0} · eliminados: {1} · componentes retirados: {2}',[result.added,result.removed,result.removedComponents])}</p>
   <DifferencePreview initialSlice={firstChanged} series={series} original={roi} restored={restored}/>
   {!result.after&&<p role="alert">{tr('El resultado está vacío. Reduzca la intensidad de limpieza.')}</p>}
   <label className="block"><input type="checkbox" disabled={roi.locked} checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/> {tr('Reemplazar estructura original')}</label>
   {!overwrite&&<label>{tr('Nombre de la nueva estructura')}<input className="bg-zinc-800 p-1 ml-2" value={name} onChange={e=>setName(e.target.value)}/></label>}
   <label className="block"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> {tr('He revisado los cambios de volumen y contorno.')}</label>
   <button data-testid="cleanup-apply" className="bg-blue-700 rounded p-2 disabled:opacity-40" disabled={!accepted||!result.after||(!overwrite&&!name.trim())||(overwrite&&roi.locked)} onClick={()=>onApply({...restored,id:overwrite?roi.id:crypto.randomUUID(),name:overwrite?roi.name:name.trim(),locked:overwrite?roi.locked:false,visible:true},overwrite)}>{tr('Aplicar limpieza')}</button>
  </>}
  <p className="text-xs"><a href="https://slicer.readthedocs.io/en/latest/user_guide/modules/segmenteditor.html#smoothing" target="_blank" rel="noreferrer">{tr('Referencia metodológica: 3D Slicer Segment Editor')}</a></p>
 </section></div>;
}

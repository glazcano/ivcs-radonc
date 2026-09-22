import type {DicomSeries} from '../types';
import {needsAxialResampling,resampleAxial,estimateAxialReconstruction} from './axialResampling';
export async function axialForViewer(series:DicomSeries,progress?:(message:string)=>void,signal?:AbortSignal):Promise<DicomSeries>{
 signal?.throwIfAborted();
 if(!needsAxialResampling(series))return series;
 const estimate=estimateAxialReconstruction(series);
 if(!estimate.supported)throw new Error(`Reconstrucción ${estimate.size.join(' × ')}; memoria estimada ${Math.ceil(estimate.estimatedPeakBytes/1024/1024)} MiB. Supera el límite; no se redujo la resolución.`);
 progress?.(`Reconstrucción ${estimate.size.join(' × ')} · ${Math.ceil(estimate.estimatedPeakBytes/1024/1024)} MiB estimados`);
 const report=(percent:number)=>progress?.(`Reconstruyendo adquisición oblicua: ${percent}%`);
 if(typeof Worker==='undefined')return resampleAxial(series,report);
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('../workers/resample.worker.ts',import.meta.url),{type:'module'});
  const done=()=>{worker.terminate();signal?.removeEventListener('abort',abort);},abort=()=>{done();reject(new Error('Operación cancelada.'));};signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{if(data.progress!==undefined){report(data.progress);return;}done();if(data.error)reject(new Error(data.error));else resolve({...data.result,sourceVolume:series});};
  worker.onerror=e=>{done();reject(new Error(e.message));};worker.postMessage({series});
 });
}

import type {DicomSlice} from '../types';
import type {BodyContourOptions} from './contourEngine';
import type {BodyMasks,BodyReviewItem} from './bodyAlgorithms';

export interface BodyResult {masks:BodyMasks; review:BodyReviewItem[]}
/** Bound HU copies to 8 MiB. The worker retains masks and geometry, never the CT volume. */
export function computeBody(slices:DicomSlice[],options:BodyContourOptions,signal:AbortSignal,progress:(percent:number)=>void):Promise<BodyResult>{
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../workers/compute.worker.ts',import.meta.url),{type:'module'});
    let next=0,finished=false;
    const finish=()=>{finished=true;worker.terminate();signal.removeEventListener('abort',abort);};
    const abort=()=>{finish();reject(new Error('Operación cancelada.'));};
    if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
    const send=()=>{
      if(finished)return;
      if(next===slices.length){progress(95);worker.postMessage({kind:'bodyFinish',args:[options]});return;}
      const batch:DicomSlice[]=[];let bytes=0;
      while(next<slices.length && (batch.length===0 || bytes+slices[next].huData.byteLength<=8*1024*1024)){
        const s=slices[next++];batch.push(s);bytes+=s.huData.byteLength;
      }
      worker.postMessage({kind:'bodyBatch',args:[batch,options]});
    };
    worker.onmessage=({data})=>{
      if(data.error){finish();reject(new Error(data.error));}
      else if(data.bodyBatchDone){progress(Math.round(next/slices.length*90));send();}
      else {finish();progress(100);resolve(data.result);}
    };
    worker.onerror=e=>{finish();reject(new Error(e.message));};
    try{send();}catch(e){finish();reject(e);}
  });
}

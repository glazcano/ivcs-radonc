import {automaticRigid3d} from '../utils/rigid3d';
import {exportMonacoRtStruct} from '../utils/monacoRtStructExporter';
import {importRtStruct,compareContours} from '../utils/rtStructImporter';
import * as contour from '../utils/contourEngine';
import {refineBodyContinuity,reviewBody, type BodyMasks} from '../utils/bodyAlgorithms';
import type {DicomSlice} from '../types';
const bodySlices:DicomSlice[]=[];
let bodyMasks:BodyMasks={};
self.onmessage=async({data})=>{
  try{
    const {kind,args}=data;let result:any;
    if(kind==='bodyBatch'){
      const options=args[1],continuity=options.useContinuity!==false && options.removeTableAndNoise!==false;
      for(const slice of args[0] as DicomSlice[]){
        bodyMasks[slice.sliceIndex]=contour.generateBodyMaskForSlice(slice,continuity?{...options,minComponentAreaMm2:0}:options);
        bodySlices.push({...slice,huData:new Int16Array(0)});
      }
      self.postMessage({bodyBatchDone:true});return;
    }
    else if(kind==='bodyFinish'){
      const options=args[0];
      if(options.useContinuity!==false && options.removeTableAndNoise!==false)bodyMasks=refineBodyContinuity(bodySlices,bodyMasks,options.minComponentAreaMm2??20);
      result={masks:bodyMasks,review:reviewBody(bodySlices,bodyMasks)};
      self.postMessage({result},{transfer:Object.values(bodyMasks).map(m=>m.buffer)});return;
    }
    else if(kind==='registration')result=automaticRigid3d(args[0],args[1],args[2],p=>self.postMessage({progress:p}),args[3]);
    else if(kind==='body')result=await contour.generateBodyVolumeForSeries(args[0],args[1],(current,total)=>self.postMessage({progress:{current,total,percent:Math.round(current/total*100)}}));
    else if(kind==='export'){
      result=exportMonacoRtStruct(args[0],args[1],args[2]);
      const restored=importRtStruct(new Uint8Array(await result.blob.arrayBuffer()),args[0]);
      const selected=args[1].filter(r=>(!args[2]?.onlyVisibleRois || r.visible) && Object.values(r.sliceMasks).some((m:any)=>m.some(v=>v)));
      result.comparison=compareContours(selected,restored,args[0]);
      result.reconstructed=restored;
    }else if(kind==='importRT')result=importRtStruct(args[0],args[1]);
    else if(typeof contour[kind]==='function')result=await contour[kind](...args);
    else throw new Error('Operación no disponible.');
    self.postMessage({result});
  }catch(e){self.postMessage({error:(e as Error).message});}
};

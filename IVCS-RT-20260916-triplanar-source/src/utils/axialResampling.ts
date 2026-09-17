import type {DicomSeries,DicomSlice} from '../types';
import {acquisitionGeometry,volumeSampler} from './volumeSampling';
import {validateVolume} from './geometry';
export function needsAxialResampling(series:DicomSeries){const g=acquisitionGeometry(series.slices,true);if(g.irregular || series.slices.some(s=>s.frameNumber))return true;try{validateVolume(series.slices);return false;}catch{return true;}}
export async function resampleAxial(series:DicomSeries,progress?:(percent:number)=>void,spacingMm?:number):Promise<DicomSeries>{
 if(!needsAxialResampling(series))return series;
 if(series.sourceVolume)throw new Error('No se permite remuestrear una reconstrucción ya derivada.');
 const g=acquisitionGeometry(series.slices,true),first=series.slices[0];
 const spacing=spacingMm ?? Math.min(...first.pixelSpacing,g.spacing);
 if(!Number.isFinite(spacing) || spacing<=0)throw new Error('Espaciado de reconstrucción inválido.');
 const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
 if(g.irregular){
  for(const s of series.slices)for(const x of [-.5,s.cols-.5])for(const y of [-.5,s.rows-.5])for(const edge of [-.5,.5])for(let i=0;i<3;i++){
   const v=s.imagePositionPatient![i]+x*g.axes[0][i]+y*g.axes[1][i]+edge*g.spacing*g.normal[i];low[i]=Math.min(low[i],v);high[i]=Math.max(high[i],v);
  }
 }else
 for(const x of [-.5,first.cols-.5])for(const y of [-.5,first.rows-.5])for(const z of [-.5,series.slices.length-.5])for(let i=0;i<3;i++){
  const v=g.origin[i]+x*g.axes[0][i]+y*g.axes[1][i]+z*g.axes[2][i];low[i]=Math.min(low[i],v);high[i]=Math.max(high[i],v);
 }
 const size=low.map((v,i)=>Math.max(1,Math.ceil((high[i]-v)/spacing-1e-9))),origin=low.map(v=>v+spacing/2) as [number,number,number];
 if(size.some(v=>v>4096) || size.reduce((a,b)=>a*b,1)>128*1024*1024)throw new Error('La reconstrucción axial supera el límite de memoria (128 millones de vóxeles). No se redujo la resolución automáticamente.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['ivcs-axial-linear-v1',series.seriesInstanceUID,series.slices.map(s=>s.frameNumber?[s.sopInstanceUID,s.frameNumber,s.imagePositionPatient,s.imageOrientationPatient]:[s.sopInstanceUID,s.imagePositionPatient,s.imageOrientationPatient]),first.cols,first.rows,first.pixelSpacing,spacing,origin,size])));
 const prefix='2.25.'+BigInt('0x'+Array.from(new Uint8Array(hash).slice(0,12),v=>v.toString(16).padStart(2,'0')).join('')).toString(),seriesUID=prefix+'.1';
 const sample=volumeSampler(series),slices:DicomSlice[]=[],[cols,rows,depth]=size;
 for(let z=0;z<depth;z++){
  const floating=series.slices.some(s=>s.pixelType==='f32'),huData=floating?new Float32Array(cols*rows):new Int16Array(cols*rows),valid=new Uint8Array(cols*rows),pz=origin[2]+z*spacing;let minHU=Infinity,maxHU=-Infinity;
  for(let y=0;y<rows;y++){const py=origin[1]+y*spacing;for(let x=0;x<cols;x++){
   const i=y*cols+x,value=sample(origin[0]+x*spacing,py,pz);
   if(value===null){huData[i]=-32768;continue;}
   const v=floating?Math.fround(value):Math.round(value);huData[i]=v;valid[i]=1;minHU=Math.min(minHU,v);maxHU=Math.max(maxHU,v);
  }}
  slices.push({...first,pixelType:floating?'f32':'i16',frameNumber:undefined,sopClassUID:!first.frameNumber?first.sopClassUID:series.modality==='CT'?'1.2.840.10008.5.1.4.1.1.2':'1.2.840.10008.5.1.4.1.1.4',id:prefix+'.'+(z+2),sopInstanceUID:prefix+'.'+(z+2),sliceIndex:z,rows,cols,pixelSpacing:[spacing,spacing],sliceThickness:spacing,sliceLocation:pz,imagePositionPatient:[origin[0],origin[1],pz],imageOrientationPatient:[1,0,0,0,1,0],huData,valid,minHU:Number.isFinite(minHU)?minHU:0,maxHU:Number.isFinite(maxHU)?maxHU:0,rescaleSlope:1,rescaleIntercept:0,fileName:undefined});
  progress?.(Math.round((z+1)/depth*100));
 }
 const result={...series,seriesInstanceUID:seriesUID,seriesDescription:series.seriesDescription+' [AXIAL MPR]',slices,sourceVolume:series,resampling:{method:g.irregular?'parallel-irregular-v1':'trilinear-v1',spacingMm:spacing,sourceSeriesUID:series.seriesInstanceUID!,irregular:g.irregular,gaps:g.intervals.filter(v=>v>g.spacing*1.5+.01).length}};
 validateVolume(slices);return result;
}

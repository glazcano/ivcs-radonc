import type {DicomSeries,DicomSlice} from '../types';
import {sliceDistance,patientPoint} from './geometry';
export function acquisitionGeometry(slices:DicomSlice[],allowIrregular=false){
 if(!slices.length)throw new Error('La serie no contiene imágenes.');
 const s=slices[0],o=s.imageOrientationPatient,p=s.imagePositionPatient;
 if(o?.length!==6 || p?.length!==3 || ![...o,...p].every(Number.isFinite))throw new Error('Faltan posición u orientación DICOM válidas.');
 const u=o.slice(0,3),v=o.slice(3),dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 if(Math.abs(dot(u,u)-1)>1e-4 || Math.abs(dot(v,v)-1)>1e-4 || Math.abs(dot(u,v))>1e-4)throw new Error('La orientación DICOM no define ejes ortonormales válidos.');
 const spacing=slices.length>1?sliceDistance(slices[1])-sliceDistance(s):s.sliceThickness;
 if(!Number.isFinite(spacing) || spacing<=.001)throw new Error('Cortes duplicados o espaciado inválido.');
 const step=slices.length>1?slices[1].imagePositionPatient?.map((x,i)=>x-p[i]):normal.map(x=>x*spacing);
 if(!step || step.length!==3 || !step.every(Number.isFinite))throw new Error('Faltan posición u orientación DICOM válidas.');
 const distances=slices.map(s=>dot(s.imagePositionPatient || [],normal)),intervals=distances.slice(1).map((v,i)=>v-distances[i]);
 let irregular=false;
 for(let z=0;z<slices.length;z++){
  const current=slices[z];
  if(current.rows!==s.rows || current.cols!==s.cols || current.pixelSpacing?.length!==2 || current.pixelSpacing.some((x,i)=>!Number.isFinite(x) || x<=0 || Math.abs(x-s.pixelSpacing[i])>1e-4))throw new Error('La serie tiene dimensiones o espaciado inconsistentes.');
  if(current.imageOrientationPatient?.length!==6 || current.imageOrientationPatient.some((x,i)=>!Number.isFinite(x) || Math.abs(x-o[i])>1e-4))throw new Error('Los cortes no son paralelos; no se puede reconstruir un volumen regular.');
  if(current.imagePositionPatient?.length!==3 || current.imagePositionPatient.some(x=>!Number.isFinite(x)))throw new Error('Faltan posición u orientación DICOM válidas.');
  if(current.imagePositionPatient.some((x,i)=>Math.abs(x-p[i]-step[i]*z)>Math.max(.01,spacing*.01)))irregular=true;
 }
 if(intervals.some(v=>!Number.isFinite(v) || v<=.001))throw new Error('Cortes duplicados o espaciado inválido.');
 if(irregular && !allowIrregular)throw new Error('Cortes duplicados, faltantes o espaciado irregular: la serie requiere remuestreo.');
 const axes=[u.map(x=>x*s.pixelSpacing[1]),v.map(x=>x*s.pixelSpacing[0]),step];
 const [a,b,c]=axes,cross=(x:number[],y:number[])=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],det=dot(a,cross(b,c));
 if(!Number.isFinite(det) || Math.abs(det)<1e-10)throw new Error('Geometría DICOM degenerada.');
 const inverse=[cross(b,c),cross(c,a),cross(a,b)].map(row=>row.map(x=>x/det));
 return {origin:p,axes,inverse,spacing:irregular?Math.min(...intervals):spacing,irregular,distances,normal,intervals};
}
const cache=new WeakMap<DicomSlice[],ReturnType<typeof makeSampler>>();
function makeSampler(slices:DicomSlice[]){
 const g=acquisitionGeometry(slices,true),{origin:p,inverse:r}=g,{cols,rows}=slices[0],depth=slices.length;
 if(g.irregular){
  const dot=(a:number[],b:number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  const plane=(index:number,point:number[])=>{
   const s=slices[index],d=point.map((v,i)=>v-s.imagePositionPatient![i]),o=s.imageOrientationPatient!;
   let x=dot(d,o.slice(0,3))/s.pixelSpacing[1],y=dot(d,o.slice(3))/s.pixelSpacing[0];
   if(x<-.500001 || y<-.500001 || x>cols-.499999 || y>rows-.499999)return null;
   x=Math.max(0,Math.min(cols-1,x));y=Math.max(0,Math.min(rows-1,y));
   const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
   const indices=[y0*cols+x0,y0*cols+Math.min(cols-1,x0+1),Math.min(rows-1,y0+1)*cols+x0,Math.min(rows-1,y0+1)*cols+Math.min(cols-1,x0+1)];
   if(s.valid && indices.some(i=>!s.valid![i]))return null;
   const a=indices.map(i=>s.huData[i]);return (a[0]*(1-fx)+a[1]*fx)*(1-fy)+(a[2]*(1-fx)+a[3]*fx)*fy;
  };
  return (px:number,py:number,pz:number):number|null=>{
   const point=[px,py,pz],d=dot(point,g.normal),last=depth-1;
   if(d<g.distances[0]-g.spacing/2 || d>g.distances[last]+g.spacing/2)return null;
   if(d<=g.distances[0])return plane(0,point);if(d>=g.distances[last])return plane(last,point);
   let lo=0,hi=last;while(hi-lo>1){const mid=(lo+hi)>>1;if(g.distances[mid]>d)hi=mid;else lo=mid;}
   const gap=g.distances[hi]-g.distances[lo],f=(d-g.distances[lo])/gap;
   // Large gaps are not reconstructed as acquired tissue. Keep only the
   // half-thickness support of the two acquired planes bordering the gap.
   if(gap>g.spacing*1.5+.01){
    if(d-g.distances[lo]<=Math.min(g.spacing,slices[lo].sliceThickness)/2)return plane(lo,point);
    if(g.distances[hi]-d<=Math.min(g.spacing,slices[hi].sliceThickness)/2)return plane(hi,point);
    return null;
   }
   if(f<1e-8)return plane(lo,point);if(f>1-1e-8)return plane(hi,point);
   const a=plane(lo,point),b=plane(hi,point);return a===null || b===null?null:a*(1-f)+b*f;
  };
 }
 return (px:number,py:number,pz:number):number|null=>{
  const dx=px-p[0],dy=py-p[1],dz=pz-p[2];
  let x=r[0][0]*dx+r[0][1]*dy+r[0][2]*dz,y=r[1][0]*dx+r[1][1]*dy+r[1][2]*dz,z=r[2][0]*dx+r[2][1]*dy+r[2][2]*dz;
  // Pixel centers define interpolation; the half-voxel boundary uses edge extension.
  if(x<-.500001 || y<-.500001 || z<-.500001 || x>cols-.499999 || y>rows-.499999 || z>depth-.499999)return null;
  x=Math.max(0,Math.min(cols-1,x));y=Math.max(0,Math.min(rows-1,y));z=Math.max(0,Math.min(depth-1,z));
  const x0=Math.floor(x),y0=Math.floor(y),z0=Math.floor(z),x1=Math.min(x0+1,cols-1),y1=Math.min(y0+1,rows-1),z1=Math.min(z0+1,depth-1),fx=x-x0,fy=y-y0,fz=z-z0;
  const a=slices[z0].huData,b=slices[z1].huData,i=y0*cols,j=y1*cols;
  if(slices[z0].valid || slices[z1].valid)for(const [sz,wz] of [[z0,1-fz],[z1,fz]])for(const [sy,wy] of [[y0,1-fy],[y1,fy]])for(const [sx,wx] of [[x0,1-fx],[x1,fx]])if(wz*wy*wx>1e-12 && slices[sz].valid && !slices[sz].valid![sy*cols+sx])return null;
  return ((a[i+x0]*(1-fx)+a[i+x1]*fx)*(1-fy)+(a[j+x0]*(1-fx)+a[j+x1]*fx)*fy)*(1-fz)+((b[i+x0]*(1-fx)+b[i+x1]*fx)*(1-fy)+(b[j+x0]*(1-fx)+b[j+x1]*fx)*fy)*fz;
 };
}
export function volumeSampler(series:DicomSeries){const slices=(series.sourceVolume || series).slices;let sampler=cache.get(slices);if(!sampler){sampler=makeSampler(slices);cache.set(slices,sampler);}return sampler;}
export function physicalCenter(series:DicomSeries):[number,number,number]{const slices=(series.sourceVolume || series).slices,s=slices[0],a=patientPoint(s,(s.cols-1)/2,(s.rows-1)/2),b=patientPoint(slices.at(-1)!,(s.cols-1)/2,(s.rows-1)/2);return a.map((x,i)=>(x+b[i])/2) as [number,number,number];}

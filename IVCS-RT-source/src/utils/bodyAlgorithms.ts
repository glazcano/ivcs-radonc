import {distanceSquared} from './distance';
import type {DicomSlice, StructureRoi} from '../types';

export type BodyMasks = Record<number, Uint8Array>;
export interface BodyComponent {id:number; size:number; minR:number; maxR:number; minC:number; maxC:number}

/** One flood traversal; the label image is also used to build the filtered output. */
export function labelBody(mask:Uint8Array, rows:number, cols:number) {
  const labels=new Int32Array(mask.length), queue=new Int32Array(mask.length), components:BodyComponent[]=[];
  for(let seed=0;seed<mask.length;seed++)if(mask[seed] && !labels[seed]){
    const id=components.length+1, component={id,size:0,minR:rows,maxR:0,minC:cols,maxC:0};
    let head=0,tail=1;queue[0]=seed;labels[seed]=id;
    while(head<tail){const p=queue[head++],r=Math.floor(p/cols),c=p%cols;
      component.minR=Math.min(component.minR,r);component.maxR=Math.max(component.maxR,r);
      component.minC=Math.min(component.minC,c);component.maxC=Math.max(component.maxC,c);
      if(r && mask[p-cols] && !labels[p-cols]){labels[p-cols]=id;queue[tail++]=p-cols;}
      if(r+1<rows && mask[p+cols] && !labels[p+cols]){labels[p+cols]=id;queue[tail++]=p+cols;}
      if(c && mask[p-1] && !labels[p-1]){labels[p-1]=id;queue[tail++]=p-1;}
      if(c+1<cols && mask[p+1] && !labels[p+1]){labels[p+1]=id;queue[tail++]=p+1;}
    }
    component.size=tail;components.push(component);
  }
  return {labels,components};
}

/** Physical disk, with the image exterior treated as background for erosion. */
export function bodyMargin(mask:Uint8Array,rows:number,cols:number,spacing:[number,number],radius:number):Uint8Array {
  if(Math.abs(radius)<.01)return mask.slice();
  const [dy,dx]=spacing, erosion=radius<0, limit=radius*radius*1.0001;
  const offsets:[number,number][]=[];
  for(let r=-Math.ceil(Math.abs(radius)/dy);r<=Math.ceil(Math.abs(radius)/dy);r++)for(let c=-Math.ceil(Math.abs(radius)/dx);c<=Math.ceil(Math.abs(radius)/dx);c++)
    if((r || c) && r*r*dy*dy+c*c*dx*dx<=limit)offsets.push([r,c]);
  const edge=new Int32Array(mask.length);let count=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const i=r*cols+c;
    if(Boolean(mask[i])!==erosion && ((r>0 && mask[i-cols]!==mask[i]) || (r+1<rows && mask[i+cols]!==mask[i]) || (c>0 && mask[i-1]!==mask[i]) || (c+1<cols && mask[i+1]!==mask[i])))edge[count++]=i;
  }
  // Boundary stamping is cheaper for smooth skin; use the distance transform for dense/noisy boundaries.
  if(count*offsets.length<mask.length*12){
    const result=mask.slice();
    for(let k=0;k<count;k++){
      const r=Math.floor(edge[k]/cols),c=edge[k]%cols;
      for(let j=0;j<offsets.length;j++){const y=r+offsets[j][0],x=c+offsets[j][1];if(y>=0 && y<rows && x>=0 && x<cols)result[y*cols+x]=erosion?0:1;}
    }
    if(erosion)for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(Math.min(((r+1)*dy)**2,((rows-r)*dy)**2,((c+1)*dx)**2,((cols-c)*dx)**2)<=limit)result[r*cols+c]=0;
    return result;
  }
  const features=erosion?new Uint8Array(mask.length):mask;
  if(erosion)for(let i=0;i<mask.length;i++)features[i]=mask[i]?0:1;
  const distances=distanceSquared(features,cols,rows,1,[dx,dy,1]);
  const result=new Uint8Array(mask.length);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const i=r*cols+c;
    const d=erosion?Math.min(distances[i],((r+1)*dy)**2,((rows-r)*dy)**2,((c+1)*dx)**2,((cols-c)*dx)**2):distances[i];
    result[i]=erosion?(mask[i] && d>limit?1:0):(d<=limit?1:0);
  }
  return result;
}

/** Only neighbors within a physical radius can alter the perimeter. */
export function smoothBody(mask:Uint8Array,rows:number,cols:number,spacing:[number,number],radius=1) {
  const offsets:[number,number][]=[];
  for(let r=-Math.floor(radius/spacing[0]);r<=radius/spacing[0];r++)for(let c=-Math.floor(radius/spacing[1]);c<=radius/spacing[1];c++)
    if((r || c) && Math.hypot(r*spacing[0],c*spacing[1])<=radius+1e-8)offsets.push([r,c]);
  const result=mask.slice();if(offsets.length<4)return result;
  const candidates=new Uint8Array(mask.length);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const i=r*cols+c;
    if((r && mask[i-cols]!==mask[i]) || (r+1<rows && mask[i+cols]!==mask[i]) || (c && mask[i-1]!==mask[i]) || (c+1<cols && mask[i+1]!==mask[i])){
      candidates[i]=1;
      for(let k=0;k<offsets.length;k++){const y=r+offsets[k][0],x=c+offsets[k][1];if(y>=0 && y<rows && x>=0 && x<cols)candidates[y*cols+x]=1;}
    }
  }
  for(let i=0;i<mask.length;i++)if(candidates[i]){
    const r=Math.floor(i/cols),c=i%cols;let count=0,valid=0;
    for(let k=0;k<offsets.length;k++){const y=r+offsets[k][0],x=c+offsets[k][1];if(y>=0 && y<rows && x>=0 && x<cols){valid++;count+=mask[y*cols+x];}}
    // Do not smooth against unavailable samples at the field boundary.
    if(valid===offsets.length){if(count/valid<=.2)result[i]=0;else if(count/valid>=.8)result[i]=1;}
  }
  return result;
}

/** A conservative candidate: an abrupt, sustained wide run in the lower image. */
export function detectBodyTableRow(mask:Uint8Array,rows:number,cols:number,spacing:[number,number]):number|null {
  const runs=new Int32Array(rows);
  for(let r=0;r<rows;r++){let run=0;for(let c=0;c<cols;c++){run=mask[r*cols+c]?run+1:0;runs[r]=Math.max(runs[r],run);}}
  const depth=Math.max(1,Math.ceil(2/spacing[0]));
  for(let r=Math.ceil(rows*.65);r<rows-depth;r++){
    if(runs[r]<cols*.45 || runs[r]<Math.max(1,runs[r-1])*1.8)continue;
    let stable=true;for(let k=1;k<=depth;k++)if(runs[r+k]<runs[r]*.9)stable=false;
    if(stable)return r;
  }
  return null;
}

export function filterBodyComponents(mask:Uint8Array,slice:Pick<DicomSlice,'rows'|'cols'|'pixelSpacing'>,minAreaMm2=20,suppressCouch=true) {
  const {rows,cols,pixelSpacing:[dy,dx]}=slice,{labels,components}=labelBody(mask,rows,cols);
  const anatomy=components.filter(c=>!(suppressCouch && c.minR>rows*.65 && ((c.maxC-c.minC+1)*dx)/((c.maxR-c.minR+1)*dy)>=3));
  const main=anatomy.reduce<BodyComponent|null>((a,b)=>!a || b.size>a.size?b:a,null);
  const keep=new Uint8Array(components.length+1);
  for(const c of anatomy)if(c===main || c.size*dx*dy>=minAreaMm2)keep[c.id]=1;
  const result=new Uint8Array(mask.length);for(let i=0;i<mask.length;i++)result[i]=keep[labels[i]];return result;
}

function compatible(a:DicomSlice,b:DicomSlice) {
  if(a.rows!==b.rows || a.cols!==b.cols || a.pixelSpacing.some((v,i)=>Math.abs(v-b.pixelSpacing[i])>1e-6))return false;
  const u=a.imageOrientationPatient,v=b.imageOrientationPatient,p=a.imagePositionPatient,q=b.imagePositionPatient;
  if(!u || !v || !p || !q || u.some((x,i)=>Math.abs(x-v[i])>1e-5))return false;
  const d=p.map((x,i)=>x-q[i]);
  if(Math.abs(d.reduce((sum,x,i)=>sum+x*u[i],0))>.01 || Math.abs(d.reduce((sum,x,i)=>sum+x*u[i+3],0))>.01)return false;
  return Math.hypot(...d)<=Math.max(a.sliceThickness || 1,b.sliceThickness || 1)*1.75;
}

/** Keep small secondary islands when both adjacent planes support them; never grow a mask. */
export function refineBodyContinuity(slices:DicomSlice[],masks:BodyMasks,minAreaMm2=20):BodyMasks {
  const result:BodyMasks={};
  for(let z=0;z<slices.length;z++){
    const s=slices[z],mask=masks[s.sliceIndex],{labels,components}=labelBody(mask,s.rows,s.cols);
    const main=components.reduce<BodyComponent|null>((a,b)=>!a || b.size>a.size?b:a,null),keep=new Uint8Array(components.length+1);
    const before=slices[z-1],after=slices[z+1],left=new Int32Array(keep.length),right=new Int32Array(keep.length);
    if(before && after && compatible(s,before) && compatible(s,after))for(let i=0;i<mask.length;i++)if(labels[i]){
      if(masks[before.sliceIndex][i])left[labels[i]]++;
      if(masks[after.sliceIndex][i])right[labels[i]]++;
    }
    for(const c of components)if(c===main || c.size*s.pixelSpacing[0]*s.pixelSpacing[1]>=minAreaMm2 || (left[c.id]>=c.size*.5 && right[c.id]>=c.size*.5))keep[c.id]=1;
    const filtered=new Uint8Array(mask.length);for(let i=0;i<mask.length;i++)filtered[i]=keep[labels[i]];result[s.sliceIndex]=filtered;
  }
  return result;
}

export interface BodyReviewItem {sliceIndex:number; position:number; areaMm2:number; reasons:string[]}
export function reviewBody(slices:DicomSlice[],masks:BodyMasks):BodyReviewItem[] {
  let previous:{area:number;x:number;y:number;slice:DicomSlice}|null=null;
  return slices.map((s,position)=>{
    const mask=masks[s.sliceIndex],reasons:string[]=[];let size=0,x=0,y=0,border=false;
    for(let i=0;i<mask.length;i++)if(mask[i]){const r=Math.floor(i/s.cols),c=i%s.cols;size++;x+=c;y+=r;border ||= !r || !c || r===s.rows-1 || c===s.cols-1;}
    const area=size*s.pixelSpacing[0]*s.pixelSpacing[1];x=size?x/size*s.pixelSpacing[1]:0;y=size?y/size*s.pixelSpacing[0]:0;
    if(!size)reasons.push('Sin contorno');if(border)reasons.push('Contacto con el borde de imagen');
    if(labelBody(mask,s.rows,s.cols).components.length>1)reasons.push('Varios componentes');
    if(previous && compatible(s,previous.slice)){
      if(Math.max(area,previous.area)>0 && Math.abs(area-previous.area)/Math.max(area,previous.area)>.35)reasons.push('Cambio brusco de área');
      if(size && previous.area && Math.hypot(x-previous.x,y-previous.y)>10)reasons.push('Cambio brusco de posición');
    }
    previous={area,x,y,slice:s};return {sliceIndex:s.sliceIndex,position,areaMm2:area,reasons};
  });
}

/** Shared acceptance guard, also enforced by the application at commit time. */
export function selectBodyReplacement(target:StructureRoi|undefined,masks:BodyMasks,preserveExisting:boolean):BodyMasks {
  if(!target)throw new Error('La estructura de destino ya no existe.');
  if(target.locked)throw new Error('La estructura de destino está bloqueada.');
  return Object.fromEntries(Object.entries(masks).filter(([key])=>!preserveExisting || !target.sliceMasks[Number(key)]?.some(v=>v)));
}

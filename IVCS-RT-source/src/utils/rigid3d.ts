import type {DicomSeries,DicomSlice,RegistrationTransform} from '../types';
import {patientPoint,voxelDepth} from './geometry';
export type Vec3=[number,number,number];
export const identity3d=(center:Vec3=[0,0,0]):RegistrationTransform=>({model:'rigid3d',center,translationX:0,translationY:0,translationZ:0,rotationX:0,rotationY:0,rotationDeg:0,scaleX:1,scaleY:1,locked:false});
export function volumeCenter(series:DicomSeries):Vec3 {const s=series.slices[Math.floor(series.slices.length/2)];return patientPoint(s,(s.cols-1)/2,(s.rows-1)/2).map((v,i)=>i===2?(series.slices[0].imagePositionPatient![2]+series.slices.at(-1)!.imagePositionPatient![2])/2:v) as Vec3;}
export function rotationMatrix(t:RegistrationTransform):number[]{
  const [x,y,z]=[t.rotationX||0,t.rotationY||0,t.rotationDeg||0].map(v=>v*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  return [cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,-sy,cy*sx,cy*cx];
}
export function transformPoint(p:Vec3,t:RegistrationTransform,inverse=false):Vec3{
  const r=rotationMatrix(t),c=t.center || [0,0,0],d=[t.translationX,t.translationY,t.translationZ];
  const q=p.map((v,i)=>v-c[i]-(inverse?d[i]:0));
  return [0,1,2].map(i=>c[i]+(inverse?0:d[i])+q.reduce((s,v,j)=>s+v*r[inverse?j*3+i:i*3+j],0)) as Vec3;
}
export function samplePhysical(series:DicomSeries,p:Vec3):number|null{
  const s=series.slices[0],o=s.imagePositionPatient!,z=(p[2]-o[2])/voxelDepth(series.slices,s),x=(p[0]-o[0])/s.pixelSpacing[1],y=(p[1]-o[1])/s.pixelSpacing[0];
  if(x<0 || y<0 || z<0 || x>s.cols-1 || y>s.rows-1 || z>series.slices.length-1)return null;
  const a=[Math.floor(x),Math.floor(y),Math.floor(z)],f=[x-a[0],y-a[1],z-a[2]];let value=0;
  for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++)value+=series.slices[Math.min(a[2]+k,series.slices.length-1)].huData[Math.min(a[1]+j,s.rows-1)*s.cols+Math.min(a[0]+i,s.cols-1)]*(i?f[0]:1-f[0])*(j?f[1]:1-f[1])*(k?f[2]:1-f[2]);
  return value;
}
export function resamplePlane(reference:DicomSlice,moving:DicomSeries,t:RegistrationTransform):DicomSlice{
  const huData=new Int16Array(reference.rows*reference.cols),valid=new Uint8Array(huData.length);
  const r=rotationMatrix(t),c=t.center || [0,0,0],d=[t.translationX,t.translationY,t.translationZ];
  const inverse=(p:Vec3)=>[0,1,2].map(i=>c[i]+[0,1,2].reduce((s,j)=>s+r[j*3+i]*(p[j]-c[j]-d[j]),0)) as Vec3;
  for(let y=0;y<reference.rows;y++)for(let x=0;x<reference.cols;x++){const value=samplePhysical(moving,inverse(patientPoint(reference,x,y)));if(value!==null){huData[y*reference.cols+x]=Math.round(value);valid[y*reference.cols+x]=1;}}
  return {...reference,id:'fusion-'+reference.id,huData,valid} as DicomSlice;
}
export interface LandmarkPair {fixed:Vec3;moving:Vec3;name?:string;}
/** Horn's absolute orientation, symmetric Jacobi eigensolver (largest algebraic eigenvalue). */
export function fitLandmarks(pairs:LandmarkPair[]){
  if(pairs.length<3 || pairs.some(p=>[...p.fixed,...p.moving].some(v=>!Number.isFinite(v))))throw new Error('Se necesitan al menos tres pares válidos.');
  const centroid=(key:'fixed'|'moving')=>[0,1,2].map(i=>pairs.reduce((s,p)=>s+p[key][i],0)/pairs.length) as Vec3;
  const fixed=centroid('fixed'),moving=centroid('moving');
  for(const key of ['fixed','moving'] as const){let spread=0;const a=pairs[0][key];for(let i=1;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){const u=pairs[i][key].map((v,k)=>v-a[k]),v=pairs[j][key].map((v,k)=>v-a[k]);spread=Math.max(spread,Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]));}if(spread<1e-3)throw new Error('Los puntos son coincidentes o colineales. Distribúyalos en la anatomía.');}
  const s=Array(9).fill(0);for(const p of pairs)for(let i=0;i<3;i++)for(let j=0;j<3;j++)s[i*3+j]+=(p.moving[i]-moving[i])*(p.fixed[j]-fixed[j]);
  const [a,b,c,d,e,f,g,h,i]=s,tr=a+e+i;
  const n=[[tr,f-h,g-c,b-d],[f-h,a-e-i,b+d,g+c],[g-c,b+d,-a+e-i,f+h],[b-d,g+c,f+h,-a-e+i]],v=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>Number(i===j)));
  for(let iter=0;iter<80;iter++){let p=0,q=1;for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(Math.abs(n[i][j])>Math.abs(n[p][q])){p=i;q=j;}if(Math.abs(n[p][q])<1e-12)break;
    const angle=.5*Math.atan2(2*n[p][q],n[q][q]-n[p][p]),cs=Math.cos(angle),sn=Math.sin(angle);
    for(let k=0;k<4;k++){const ap=n[k][p],aq=n[k][q];n[k][p]=cs*ap-sn*aq;n[k][q]=sn*ap+cs*aq;const vp=v[k][p],vq=v[k][q];v[k][p]=cs*vp-sn*vq;v[k][q]=sn*vp+cs*vq;}
    for(let k=0;k<4;k++){const ap=n[p][k],aq=n[q][k];n[p][k]=cs*ap-sn*aq;n[q][k]=sn*ap+cs*aq;}
  }
  let best=0;for(let k=1;k<4;k++)if(n[k][k]>n[best][best])best=k;const [w,x,y,z]=v.map(row=>row[best]);
  const r=[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)];
  const ry=Math.asin(Math.max(-1,Math.min(1,-r[6]))),rx=Math.abs(Math.cos(ry))>1e-8?Math.atan2(r[7],r[8]):0,rz=Math.abs(Math.cos(ry))>1e-8?Math.atan2(r[3],r[0]):Math.atan2(-r[1],r[4]);
  const transform={...identity3d(moving),translationX:fixed[0]-moving[0],translationY:fixed[1]-moving[1],translationZ:fixed[2]-moving[2],rotationX:rx*180/Math.PI,rotationY:ry*180/Math.PI,rotationDeg:rz*180/Math.PI};
  const errors=pairs.map(p=>Math.hypot(...transformPoint(p.moving,transform).map((v,i)=>v-p.fixed[i])));
  return {transform,errors,rms:Math.sqrt(errors.reduce((s,v)=>s+v*v,0)/errors.length)};
}
export function automaticRigid3d(fixed:DicomSeries,moving:DicomSeries,initial:RegistrationTransform,progress?:(p:any)=>void){
  if(fixed.slices.length<3 || moving.slices.length<3)throw new Error('El registro volumétrico requiere al menos tres cortes en cada serie.');
  let best={...initial,model:'rigid3d' as const,scaleX:1,scaleY:1};
  const keys=['translationX','translationY','translationZ','rotationX','rotationY','rotationDeg'] as const;
  const levels=[8,4,2,1,.5];let finalScore=0;
  for(let level=0;level<levels.length;level++){
    const stride=Math.max(1,Math.ceil(Math.cbrt(fixed.slices.length*fixed.slices[0].rows*fixed.slices[0].cols/(3000+level*2000))));
    const samples:{p:Vec3;value:number}[]=[];
    for(let z=0;z<fixed.slices.length;z+=stride){const s=fixed.slices[z];for(let y=0;y<s.rows;y+=stride)for(let x=0;x<s.cols;x+=stride)samples.push({p:patientPoint(s,x,y),value:s.huData[y*s.cols+x]});}
    const minA=Math.min(...samples.map(s=>s.value)),maxA=Math.max(...samples.map(s=>s.value)),minB=Math.min(...moving.slices.map(s=>s.minHU)),maxB=Math.max(...moving.slices.map(s=>s.maxHU));
    if(maxA-minA<1 || maxB-minB<1)throw new Error('No hay contraste suficiente para el registro automático.');
    const score=(t:RegistrationTransform)=>{const joint=new Float64Array(32*32),ha=new Float64Array(32),hb=new Float64Array(32);let count=0;
      const r=rotationMatrix(t),c=t.center || [0,0,0],d=[t.translationX,t.translationY,t.translationZ];
      for(const sample of samples){const q=sample.p.map((v,i)=>v-c[i]-d[i]),p=[0,1,2].map(i=>c[i]+q.reduce((s,v,j)=>s+r[j*3+i]*v,0)) as Vec3,b=samplePhysical(moving,p);if(b===null)continue;
        const ai=Math.max(0,Math.min(31,Math.floor(31*(sample.value-minA)/(maxA-minA)))),bi=Math.max(0,Math.min(31,Math.floor(31*(b-minB)/(maxB-minB))));joint[ai*32+bi]++;ha[ai]++;hb[bi]++;count++;
      }
      const overlap=count/samples.length;if(count<100 || overlap<.25)return -Infinity;
      const entropy=(h:Float64Array)=>h.reduce((s,v)=>v?s-v/count*Math.log(v/count):s,0),hj=entropy(joint);
      return hj>1e-6?(entropy(ha)+entropy(hb))/hj+.05*overlap:-Infinity;
    };
    let value=score(best);
    if(level===0){
      const a=volumeCenter(fixed),b=transformPoint(volumeCenter(moving),best),centered={...best,translationX:best.translationX+a[0]-b[0],translationY:best.translationY+a[1]-b[1],translationZ:best.translationZ+a[2]-b[2]};
      const centeredScore=score(centered);if(centeredScore>value){best=centered;value=centeredScore;}
      // Translation-only initial search avoids compensating a large shift with rotation.
      for(const step of [4,2,1])for(let iteration=0;iteration<8;iteration++){
        let improved=false;for(const key of keys.slice(0,3))for(const sign of [-1,1]){const candidate={...best,[key]:(best[key] || 0)+sign*step},s=score(candidate);if(s>value+1e-7){best=candidate;value=s;improved=true;}}
        if(!improved)break;
      }
    }
    for(let iteration=0;iteration<20;iteration++){
      let changed=false;for(const key of keys){let winner=best,winnerScore=value;
        for(const sign of [-1,1]){const candidate={...best,[key]:(best[key] || 0)+sign*levels[level]*(key.startsWith('rotation')?.5:1)},s=score(candidate);if(s>winnerScore+1e-7){winner=candidate;winnerScore=s;}}
        if(winner!==best){best=winner;value=winnerScore;changed=true;}
      }progress?.({percent:Math.round((level+(iteration+1)/20)/levels.length*100),score:value});if(!changed)break;
    }finalScore=value;
  }
  if(!Number.isFinite(finalScore))throw new Error('Solapamiento insuficiente. Inicialice por puntos o centre los volúmenes.');
  return {transform:best,score:finalScore};
}

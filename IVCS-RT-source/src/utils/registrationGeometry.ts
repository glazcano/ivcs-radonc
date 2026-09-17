import type {DicomSeries,DicomSlice,RegistrationTransform,RegistrationVoi} from '../types';
import {identity3d,rotationMatrix,transformPoint,Vec3} from './rigid3d';
import {patientPoint,voxelDepth} from './geometry';
export function fromMatrix(r:number[],b:Vec3,locked=false):RegistrationTransform{
 const y=Math.asin(Math.max(-1,Math.min(1,-r[6]))),regular=Math.abs(Math.cos(y))>1e-8;
 return {...identity3d(),locked,translationX:b[0],translationY:b[1],translationZ:b[2],rotationX:(regular?Math.atan2(r[7],r[8]):0)*180/Math.PI,rotationY:y*180/Math.PI,rotationDeg:(regular?Math.atan2(r[3],r[0]):Math.atan2(-r[1],r[4]))*180/Math.PI};
}
export function compose(a:RegistrationTransform,b:RegistrationTransform):RegistrationTransform{
 const x=rotationMatrix(a),y=rotationMatrix(b),r=Array.from({length:9},(_,i)=>[0,1,2].reduce((sum,k)=>sum+x[Math.floor(i/3)*3+k]*y[k*3+i%3],0));
 return fromMatrix(r,transformPoint(transformPoint([0,0,0],b),a),b.locked);
}
export function inverse(t:RegistrationTransform){const r=rotationMatrix(t);return fromMatrix([r[0],r[3],r[6],r[1],r[4],r[7],r[2],r[5],r[8]],transformPoint([0,0,0],t,true),t.locked);}
export function sameTransform(a:RegistrationTransform,b:RegistrationTransform,tolerance=.01){return ([[0,0,0],[100,0,0],[0,100,0],[0,0,100]] as Vec3[]).every(p=>Math.hypot(...transformPoint(p,a).map((v,i)=>v-transformPoint(p,b)[i]))<tolerance);}
/** Rotate in the displayed plane about a physical point; compose in world coordinates. */
export function dragTransform(t:RegistrationTransform,s:DicomSlice,du:number,dv:number,angle:number|undefined,pivot:Vec3){
 const o=s.imageOrientationPatient || [1,0,0,0,1,0];
 if(angle===undefined)return {...t,translationX:t.translationX+du*o[0]+dv*o[3],translationY:t.translationY+du*o[1]+dv*o[4],translationZ:t.translationZ+du*o[2]+dv*o[5]};
 const n=[o[1]*o[5]-o[2]*o[4],o[2]*o[3]-o[0]*o[5],o[0]*o[4]-o[1]*o[3]],c=Math.cos(angle),sin=Math.sin(angle),[x,y,z]=n;
 const r=[c+x*x*(1-c),x*y*(1-c)-z*sin,x*z*(1-c)+y*sin,y*x*(1-c)+z*sin,c+y*y*(1-c),y*z*(1-c)-x*sin,z*x*(1-c)-y*sin,z*y*(1-c)+x*sin,c+z*z*(1-c)];
 const b=pivot.map((v,i)=>v-r.slice(i*3,i*3+3).reduce((sum,q,j)=>sum+q*pivot[j],0)) as Vec3;
 const result=compose(fromMatrix(r,b),t),center=transformPoint(pivot,t,true),atCenter=transformPoint(center,result);
 return {...result,center,translationX:atCenter[0]-center[0],translationY:atCenter[1]-center[1],translationZ:atCenter[2]-center[2]};
}
export interface PhysicalVoi {min:Vec3;max:Vec3;}
export function physicalVoi(series:DicomSeries,v:RegistrationVoi):PhysicalVoi|undefined{
 if(!v.enabled)return undefined;
 const s=series.slices[0],z0=Math.max(0,Math.min(series.slices.length-1,Math.floor(v.minSlice))),z1=Math.max(z0,Math.min(series.slices.length-1,Math.floor(v.maxSlice)));
 const p=patientPoint(series.slices[z0],v.minX-.5,v.minY-.5),q=patientPoint(series.slices[z1],v.maxX+.5,v.maxY+.5),dz=voxelDepth(series.slices,s)/2;
 p[2]-=dz;q[2]+=dz;
 return {min:p.map((n,i)=>Math.min(n,q[i])) as Vec3,max:p.map((n,i)=>Math.max(n,q[i])) as Vec3};
}

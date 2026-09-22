import type {DicomSeries} from '../types';
import {readDicomDataset} from './dicomDataset.mjs';
import {REG_SOP_CLASS} from './spatialRegistrationExporter';
import {compose,fromMatrix,inverse} from './registrationGeometry';
import {identity3d} from './rigid3d';
import {dicomText} from './dicomText';
const items=(ds:any,tag:string):any[]=>ds.elements[tag]?.items?.map((i:any)=>i.dataSet) || [];
export function rigidFromDicomMatrix(m:number[]){
 if(m.length!==16 || !m.every(Number.isFinite) || m.slice(12).some((v,i)=>Math.abs(v-(i===3?1:0))>1e-6))throw new Error('Matriz REG inválida.');
 const r=[m[0],m[1],m[2],m[4],m[5],m[6],m[8],m[9],m[10]];
 for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs([0,1,2].reduce((s,k)=>s+r[i*3+k]*r[j*3+k],0)-(i===j?1:0))>1e-4)throw new Error('REG no rígido: escala o cizallamiento.');
 const det=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);
 if(Math.abs(det-1)>1e-4)throw new Error('REG no rígido: reflexión.');
 return fromMatrix(r,[m[3],m[7],m[11]]);
}
/** DICOM PS3.3 C.20.2: each item maps source LPS to registered LPS.
 * Explicit SOP references take precedence over FoR matching (shared FoRs can repeat).
 * Deliberately reject ambiguous matches and multi-matrix chains in this first importer.
 */
export function importSpatialRegistration(bytes:Uint8Array,reference:DicomSeries,moving:DicomSeries){
 const ds=readDicomDataset(bytes);
 if(ds.string('x00080016')!==REG_SOP_CLASS)throw new Error('Se requiere un objeto DICOM Spatial Registration rígido.');
 if(reference.patientId!==moving.patientId || dicomText(ds,'x00100020')!==reference.patientId)throw new Error('REG pertenece a otro paciente.');
 const registrations=items(ds,'x00700308');
 const resolve=(series:DicomSeries)=>{
  const native=series.sourceVolume || series,sops=new Set(native.slices.map(s=>s.sopInstanceUID));
  const candidates=registrations.filter(item=>{const refs=items(item,'x00081140'),frame=item.string('x00200052');if(frame && frame!==native.frameOfReferenceUID)return false;return refs.length?refs.every(r=>{const uid=r.string('x00081155'),frames=r.string('x00081160')?.split('\\').map(Number);return sops.has(uid) && (!frames || frames.every(f=>native.slices.some(s=>s.sopInstanceUID===uid && s.frameNumber===f)));}):!!native.frameOfReferenceUID && frame===native.frameOfReferenceUID;});
  if(!candidates.length && native.frameOfReferenceUID===ds.string('x00200052') && !registrations.some(item=>item.string('x00200052')===native.frameOfReferenceUID))return identity3d();
  if(candidates.length!==1)throw new Error('Referencias REG ambiguas o no correspondientes a las series seleccionadas.');
  const matrixRegistrations=items(candidates[0],'x00700309');
  if(matrixRegistrations.length!==1)throw new Error('REG contiene múltiples registros; se requiere una transformación inequívoca.');
  const matrices=items(matrixRegistrations[0],'x0070030a');
  if(matrices.length!==1 || matrices[0].string('x0070030c')!=='RIGID')throw new Error('Solo se admite una matriz RIGID por marco de referencia.');
  return rigidFromDicomMatrix((matrices[0].string('x300600c6') || '').split('\\').map(Number));
 };
 return {transform:compose(inverse(resolve(reference)),resolve(moving)),source:'DICOM REG',sopInstanceUID:ds.string('x00080018')};
}

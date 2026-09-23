import {maskGeometry,maskScale,nativeMaskIndex,type MaskScale} from './segmentationGrid';
import type {DicomSeries,DicomSlice,StructureRoi} from '../types';
import type {LibraryStudy} from './libraryClient';
import {volumeSampler} from './volumeSampling';
import {patientPoint} from './geometry';
export function temporalLabel(s:LibraryStudy){const d=s.acquisitionDimensions;return d?.respiratory!==undefined?d.respiratory+'%':d?.phase || d?.cardiac || s.description;}
export function temporalPeers(reference:DicomSeries,entries:LibraryStudy[]){
 const source=reference.sourceVolume || reference,d=reference.acquisitionDimensions || {},nonTime=(v:Record<string,string>)=>JSON.stringify(Object.entries(v).filter(([k])=>!['phase','respiratory','cardiac'].includes(k)).sort());
 if(!['phase','respiratory','cardiac'].some(k=>d[k]!==undefined))return [];
 return entries.filter(e=>(e.sourceSeriesUID || e.seriesInstanceUID)===source.seriesInstanceUID && e.frameOfReferenceUID===reference.frameOfReferenceUID && nonTime(e.acquisitionDimensions || {})===nonTime(d)).sort((a,b)=>temporalLabel(a).localeCompare(temporalLabel(b),undefined,{numeric:true}));
}
/** Sample a temporal image in the unchanged reference LPS grid. No motion-removing registration. */
export function temporalPlane(reference:DicomSlice,phase:DicomSeries){
 const values=new Float32Array(reference.rows*reference.cols),valid=new Uint8Array(values.length),sample=volumeSampler(phase);
 for(let y=0;y<reference.rows;y++)for(let x=0;x<reference.cols;x++){const i=y*reference.cols+x,v=sample(...patientPoint(reference,x,y));if(v!==null){values[i]=v;valid[i]=1;}}
 return {values,valid};
}
export function combineTemporalPlanes(planes:ReturnType<typeof temporalPlane>[],mode:'MIP'|'AIP'){
 if(!planes.length || planes.some(p=>p.values.length!==planes[0].values.length))throw new Error('Inconsistent temporal planes.');
 const values=new Float32Array(planes[0].values.length),valid=new Uint8Array(values.length);
 for(let i=0;i<values.length;i++){
  if(planes.some(p=>!p.valid[i]))continue;
  values[i]=mode==='MIP'?Math.max(...planes.map(p=>p.values[i])):planes.reduce((sum,p)=>sum+p.values[i],0)/planes.length;valid[i]=1;
 }
 return {values,valid};
}
/** Union of phase masks in patient coordinates; nearest-neighbour mask sampling.
 * No registration is applied: the respiratory displacement is the quantity retained. */
export function unionPhaseMasks(reference:DicomSeries,phases:{series:DicomSeries;roi:StructureRoi}[],targetScale:MaskScale=phases.some(p=>maskScale(p.roi)===2)?2:1){
 if(!phases.length)throw new Error('No phase contours selected.');
 const result:Record<number,Uint8Array>={};
 for(const phase of phases){
  if(phase.series.patientId!==reference.patientId || phase.series.frameOfReferenceUID!==reference.frameOfReferenceUID)throw new Error('Phase contours have incompatible DICOM coordinates.');
  if(targetScale<maskScale(phase.roi))throw new Error('ITV grid cannot reduce segmentation resolution.');
  const first=maskGeometry(phase.series.slices[0],maskScale(phase.roi)),dz=phase.series.slices.length>1?phase.series.slices[1].imagePositionPatient![2]-first.imagePositionPatient![2]:first.sliceThickness;
  if(phase.series.slices.some(s=>s.imageOrientationPatient!.some((v,i)=>Math.abs(v-[1,0,0,0,1,0][i])>1e-4)))throw new Error('Phase mask grid must be axial.');
  const ref=maskGeometry(reference.slices[0],targetScale),refDz=reference.slices.length>1?reference.slices[1].imagePositionPatient![2]-ref.imagePositionPatient![2]:ref.sliceThickness;
  for(const [key,mask] of Object.entries(phase.roi.sliceMasks)){
   const native=phase.series.slices[Number(key)];const s=native?maskGeometry(native,maskScale(phase.roi)):undefined;if(!s || mask.length!==s.rows*s.cols)throw new Error('Invalid phase contour geometry.');
   for(let i=0;i<mask.length;i++)if(mask[i]){
    const p=patientPoint(s,i%s.cols,Math.floor(i/s.cols)),x=(p[0]-ref.imagePositionPatient![0])/ref.pixelSpacing[1],y=(p[1]-ref.imagePositionPatient![1])/ref.pixelSpacing[0],z=(p[2]-ref.imagePositionPatient![2])/refDz;
    if(x<-.5 || y<-.5 || z<-.5 || x>=ref.cols-.5 || y>=ref.rows-.5 || z>=reference.slices.length-.5)throw new Error('A phase contour extends beyond the reference field of view; no cropped ITV was created.');
   }
  }
  for(let z=0;z<reference.slices.length;z++){
   const s=maskGeometry(reference.slices[z],targetScale);let mask=result[z];
   for(let y=0;y<s.rows;y++)for(let x=0;x<s.cols;x++){
    const p=patientPoint(s,x,y),zi=Math.round((p[2]-first.imagePositionPatient![2])/dz),native=phase.series.slices[zi];if(!native)continue;const src=maskGeometry(native,maskScale(phase.roi));
    const xi=Math.round((p[0]-src.imagePositionPatient![0])/src.pixelSpacing[1]),yi=Math.round((p[1]-src.imagePositionPatient![1])/src.pixelSpacing[0]);
    if(xi<0 || yi<0 || xi>=src.cols || yi>=src.rows)continue;
    if(phase.roi.sliceMasks[zi]?.[yi*src.cols+xi]){if(s.valid && !s.valid[nativeMaskIndex(y*s.cols+x,reference.slices[z].cols,targetScale)])throw new Error('A phase contour crosses missing reference image data.');mask ||= new Uint8Array(s.rows*s.cols);mask[y*s.cols+x]=1;}
   }
   if(mask)result[z]=mask;
  }
 }
 return result;
}

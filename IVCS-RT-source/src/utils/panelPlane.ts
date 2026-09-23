import type {DicomSeries,DicomSlice,MprCoordinates,StructureRoi} from '../types';
import {voxelDepth} from './geometry';
export type ImagePlane='axial'|'coronal'|'sagittal';
/** Copy only changed axial slices; one plane edit is one undo transaction. */
export function writePlaneMask(series:DicomSeries,coords:MprCoordinates,plane:ImagePlane,roi:StructureRoi,mask:Uint8Array){
 const first=series.slices[0],width=plane==='sagittal'?first.rows:first.cols;
 const height=plane==='axial'?first.rows:series.slices.length;
 if(mask.length!==width*height)throw new Error('Invalid plane mask dimensions');
 const result:StructureRoi['sliceMasks']={};
 for(let v=0;v<height;v++)for(let u=0;u<width;u++){
  const z=plane==='axial'?coords.z:series.slices.length-1-v;
  const i=plane==='axial'?v*first.cols+u:plane==='coronal'?coords.y*first.cols+u:u*first.cols+coords.x;
  const old=roi.sliceMasks[z]?.[i] || 0, value=series.slices[z].valid?.[i]===0?0:mask[v*width+u];
  if(old===value)continue;
  result[z]??=roi.sliceMasks[z]?.slice() || new Uint8Array(first.rows*first.cols);
  result[z][i]=value;
 }
 return result;
}
export function referencePlane(series:DicomSeries,coords:MprCoordinates,plane:ImagePlane):DicomSlice{
 if(plane==='axial')return series.slices[Math.max(0,Math.min(series.slices.length-1,coords.z))];
 const first=series.slices[0],last=series.slices.at(-1)!,cols=plane==='coronal'?first.cols:first.rows,rows=series.slices.length,data=first.pixelType==='f32'?new Float32Array(cols*rows):new Int16Array(cols*rows);
 const valid=new Uint8Array(cols*rows);
 const fixed=Math.max(0,Math.min(plane==='coronal'?first.rows-1:first.cols-1,plane==='coronal'?coords.y:coords.x));
 for(let v=0;v<rows;v++){const source=series.slices[rows-1-v];for(let u=0;u<cols;u++){const i=plane==='coronal'?fixed*first.cols+u:u*first.cols+fixed;data[v*cols+u]=source.huData[i];valid[v*cols+u]=source.valid?source.valid[i]:1;}}
 return {...first,id:plane+'-'+fixed,rows,cols,huData:data,valid,pixelSpacing:[voxelDepth(series.slices,first),first.pixelSpacing[plane==='coronal'?1:0]],imagePositionPatient:plane==='coronal'?[first.imagePositionPatient![0],first.imagePositionPatient![1]+fixed*first.pixelSpacing[0],last.imagePositionPatient![2]]:[first.imagePositionPatient![0]+fixed*first.pixelSpacing[1],first.imagePositionPatient![1],last.imagePositionPatient![2]],imageOrientationPatient:plane==='coronal'?[1,0,0,0,0,-1]:[0,1,0,0,0,-1]};
}
export function planeMask(series:DicomSeries,coords:MprCoordinates,plane:ImagePlane,roi:StructureRoi){
 if(plane==='axial')return roi.sliceMasks[coords.z];const s=series.slices[0],cols=plane==='coronal'?s.cols:s.rows,mask=new Uint8Array(cols*series.slices.length);
 for(let v=0;v<series.slices.length;v++){const source=roi.sliceMasks[series.slices.length-1-v];if(source)for(let u=0;u<cols;u++)mask[v*cols+u]=source[plane==='coronal'?coords.y*s.cols+u:u*s.cols+coords.x];}return mask;
}

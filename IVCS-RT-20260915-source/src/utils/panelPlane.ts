import type {DicomSeries,DicomSlice,MprCoordinates,StructureRoi} from '../types';
import {voxelDepth} from './geometry';
export type ImagePlane='axial'|'coronal'|'sagittal';
export function referencePlane(series:DicomSeries,coords:MprCoordinates,plane:ImagePlane):DicomSlice{
 if(plane==='axial')return series.slices[Math.max(0,Math.min(series.slices.length-1,coords.z))];
 const first=series.slices[0],last=series.slices.at(-1)!,cols=plane==='coronal'?first.cols:first.rows,rows=series.slices.length,data=new Int16Array(cols*rows);
 const fixed=Math.max(0,Math.min(plane==='coronal'?first.rows-1:first.cols-1,plane==='coronal'?coords.y:coords.x));
 for(let v=0;v<rows;v++){const source=series.slices[rows-1-v];for(let u=0;u<cols;u++)data[v*cols+u]=source.huData[plane==='coronal'?fixed*first.cols+u:u*first.cols+fixed];}
 return {...first,id:plane+'-'+fixed,rows,cols,huData:data,pixelSpacing:[voxelDepth(series.slices,first),first.pixelSpacing[plane==='coronal'?1:0]],imagePositionPatient:plane==='coronal'?[first.imagePositionPatient![0],first.imagePositionPatient![1]+fixed*first.pixelSpacing[0],last.imagePositionPatient![2]]:[first.imagePositionPatient![0]+fixed*first.pixelSpacing[1],first.imagePositionPatient![1],last.imagePositionPatient![2]],imageOrientationPatient:plane==='coronal'?[1,0,0,0,0,-1]:[0,1,0,0,0,-1]};
}
export function planeMask(series:DicomSeries,coords:MprCoordinates,plane:ImagePlane,roi:StructureRoi){
 if(plane==='axial')return roi.sliceMasks[coords.z];const s=series.slices[0],cols=plane==='coronal'?s.cols:s.rows,mask=new Uint8Array(cols*series.slices.length);
 for(let v=0;v<series.slices.length;v++){const source=roi.sliceMasks[series.slices.length-1-v];if(source)for(let u=0;u<cols;u++)mask[v*cols+u]=source[plane==='coronal'?coords.y*s.cols+u:u*s.cols+coords.x];}return mask;
}

import type {DicomSeries,DicomSlice,MprCoordinates,StructureRoi} from '../types';
import {voxelDepth} from './geometry';
import {maskScale,maskGeometry,rescaleMask,nativeMaskIndex,gridIndex,imageCoordinate,type MaskScale} from './segmentationGrid';
export type ImagePlane='axial'|'coronal'|'sagittal';
/** Copy only changed slices: immutable masks keep history and render caches cheap. */
export function writePlaneMask(series:DicomSeries,coords:MprCoordinates,plane:ImagePlane,roi:StructureRoi,mask:Uint8Array){
 const first=series.slices[0],f=maskScale(roi),cols=first.cols*f,width=(plane==='sagittal'?first.rows:first.cols)*f;
 const height=plane==='axial'?first.rows*f:series.slices.length;
 if(mask.length!==width*height)throw new Error('Invalid plane mask dimensions');
 const fixed=gridIndex(plane==='coronal'?coords.y:coords.x,plane==='coronal'?first.rows:first.cols,f);
 const result:StructureRoi['sliceMasks']={};
 for(let v=0;v<height;v++)for(let u=0;u<width;u++){
  const z=plane==='axial'?coords.z:series.slices.length-1-v;
  const i=plane==='axial'?v*cols+u:plane==='coronal'?fixed*cols+u:u*cols+fixed;
  const old=roi.sliceMasks[z]?.[i]||0,value=series.slices[z].valid?.[nativeMaskIndex(i,first.cols,f)]===0?0:mask[v*width+u];
  if(old===value)continue;
  result[z]??=roi.sliceMasks[z]?.slice()||new Uint8Array(first.rows*first.cols*f*f);result[z][i]=value;
 }
 return result;
}
/** Interpolate only the displayed plane, never allocate a supersampled DICOM volume. */
export function referencePlane(series:DicomSeries,coords:MprCoordinates,plane:ImagePlane,f:MaskScale=1):DicomSlice{
 const z=Math.max(0,Math.min(series.slices.length-1,coords.z)),first=series.slices[0],last=series.slices.at(-1)!;
 if(plane==='axial'&&f===1)return series.slices[z];
 const fixed=gridIndex(plane==='coronal'?coords.y:coords.x,plane==='coronal'?first.rows:first.cols,f),position=imageCoordinate(fixed,f);
 const cols=(plane==='sagittal'?first.rows:first.cols)*f,rows=plane==='axial'?first.rows*f:series.slices.length,data=new Float32Array(cols*rows),valid=new Uint8Array(data.length);
 for(let v=0;v<rows;v++)for(let u=0;u<cols;u++){
  const source=series.slices[plane==='axial'?z:rows-1-v];
  const x=plane==='sagittal'?position:imageCoordinate(u,f),y=plane==='axial'?imageCoordinate(v,f):plane==='coronal'?position:imageCoordinate(u,f);
  const xx=Math.max(0,Math.min(first.cols-1,x)),yy=Math.max(0,Math.min(first.rows-1,y)),x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(first.cols-1,x0+1),y1=Math.min(first.rows-1,y0+1),dx=xx-x0,dy=yy-y0;
  const i=v*cols+u,nearest=Math.round(yy)*first.cols+Math.round(xx);
  valid[i]=source.valid?.[nearest]===0?0:1;
  const a=y0*first.cols+x0,b=y0*first.cols+x1,c=y1*first.cols+x0,d=y1*first.cols+x1;
  const wa=source.valid?.[a]===0?0:(1-dx)*(1-dy),wb=source.valid?.[b]===0?0:dx*(1-dy),wc=source.valid?.[c]===0?0:(1-dx)*dy,wd=source.valid?.[d]===0?0:dx*dy,weight=wa+wb+wc+wd;
  data[i]=weight?(source.huData[a]*wa+source.huData[b]*wb+source.huData[c]*wc+source.huData[d]*wd)/weight:0;
 }
 const g=maskGeometry(plane==='axial'?series.slices[z]:first,f);
 if(plane==='axial')return {...g,id:g.id+'-grid-'+f,pixelType:'f32',huData:data,valid};
 return {...g,id:plane+'-'+fixed+'-'+f,pixelType:'f32',rows,cols,huData:data,valid,pixelSpacing:[voxelDepth(series.slices,first),g.pixelSpacing[plane==='coronal'?1:0]],imagePositionPatient:plane==='coronal'?[g.imagePositionPatient![0],first.imagePositionPatient![1]+position*first.pixelSpacing[0],last.imagePositionPatient![2]]:[first.imagePositionPatient![0]+position*first.pixelSpacing[1],g.imagePositionPatient![1],last.imagePositionPatient![2]],imageOrientationPatient:plane==='coronal'?[1,0,0,0,0,-1]:[0,1,0,0,0,-1]};
}
export function planeMask(series:DicomSeries,coords:MprCoordinates,plane:ImagePlane,roi:StructureRoi,target:MaskScale=maskScale(roi)){
 const s=series.slices[0],f=maskScale(roi),sourceAt=(z:number)=>{const m=roi.sliceMasks[z];if(!m)return undefined;if(target<f){const out=new Uint8Array(s.rows*s.cols);for(let i=0;i<out.length;i++)out[i]=m[Math.floor(i/s.cols)*2*s.cols*2+(i%s.cols)*2];return out;}return rescaleMask(m,s.rows,s.cols,f,target);};
 if(plane==='axial')return sourceAt(coords.z);
 const cols=(plane==='coronal'?s.cols:s.rows)*target,mask=new Uint8Array(cols*series.slices.length),fixed=gridIndex(plane==='coronal'?coords.y:coords.x,plane==='coronal'?s.rows:s.cols,target);
 for(let v=0;v<series.slices.length;v++){const source=sourceAt(series.slices.length-1-v);if(source)for(let u=0;u<cols;u++)mask[v*cols+u]=source[plane==='coronal'?fixed*s.cols*target+u:u*s.cols*target+fixed];}
 return mask;
}

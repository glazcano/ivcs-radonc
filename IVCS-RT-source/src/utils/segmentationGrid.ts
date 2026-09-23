import type {DicomSeries,DicomSlice,StructureRoi} from '../types';
export type MaskScale=1|2;
export const maskScale=(roi?:Pick<StructureRoi,'maskScale'>|null):MaskScale=>roi?.maskScale===2?2:1;
/** Preserve the original voxel cell extents, not just the centre of the first voxel. */
export function maskGeometry(slice:DicomSlice,scale:MaskScale):DicomSlice {
 if(scale===1)return slice;
 const p=slice.imagePositionPatient, o=slice.imageOrientationPatient||[1,0,0,0,1,0],offset=(1/scale-1)/2;
 return {...slice,rows:slice.rows*scale,cols:slice.cols*scale,pixelSpacing:[slice.pixelSpacing[0]/scale,slice.pixelSpacing[1]/scale],imagePositionPatient:p?p.map((v,i)=>v+offset*(o[i]*slice.pixelSpacing[1]+o[i+3]*slice.pixelSpacing[0])) as [number,number,number]:undefined};
}
/** Geometry only: deliberately no interpolated image volume is allocated. */
export function maskSeries(series:DicomSeries,scale:MaskScale):DicomSeries {
 return {...series,sourceVolume:undefined,slices:series.slices.map(s=>({...maskGeometry(s,scale),huData:new Int16Array(0),valid:undefined}))};
}
export function nativeMaskIndex(i:number,nativeCols:number,scale:MaskScale){const cols=nativeCols*scale;return Math.floor(i/cols/scale)*nativeCols+Math.floor(i%cols/scale);}
const enlarged=new WeakMap<Uint8Array,Uint8Array>();
export function rescaleMask(mask:Uint8Array,rows:number,cols:number,from:MaskScale,to:MaskScale):Uint8Array {
 if(mask.length!==rows*cols*from*from)throw new Error('Invalid segmentation grid dimensions.');
 if(from===to)return mask;
 if(to<from)throw new Error('Reducing segmentation resolution requires an explicit resampling operation.');
 const cached=enlarged.get(mask);if(cached)return cached;
 const out=new Uint8Array(rows*cols*4),w=cols*2;
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const v=mask[y*cols+x],i=2*y*w+2*x;out[i]=out[i+1]=out[i+w]=out[i+w+1]=v;}
 enlarged.set(mask,out);return out;
}
export function roiAtScale(roi:StructureRoi,series:DicomSeries,scale:MaskScale):StructureRoi {
 if(maskScale(roi)===scale)return roi;
 const sliceMasks:StructureRoi['sliceMasks']={};
 for(const [z,m] of Object.entries(roi.sliceMasks)){const s=series.slices[Number(z)];if(!s)throw new Error('Invalid segmentation slice.');sliceMasks[Number(z)]=rescaleMask(m,s.rows,s.cols,maskScale(roi),scale);}
 return {...roi,maskScale:scale,sliceMasks,volumeCm3:undefined};
}
export const gridIndex=(coordinate:number,count:number,scale:MaskScale)=>Math.max(0,Math.min(count*scale-1,Math.floor((coordinate+.5)*scale)));
export const imageCoordinate=(index:number,scale:MaskScale)=>(index+.5)/scale-.5;

/** Lightweight geometry validation for local library records (no image scan). */
export function validateMaskGrids(rois:StructureRoi[],series:DicomSeries){
 for(const roi of rois){if(roi.maskScale!==undefined&&roi.maskScale!==1&&roi.maskScale!==2)throw new Error('Unsupported segmentation resolution.');
  for(const [z,m] of Object.entries(roi.sliceMasks)){const s=series.slices[Number(z)];if(!Number.isInteger(Number(z))||!s||!(m instanceof Uint8Array)||m.length!==s.rows*s.cols*maskScale(roi)**2)throw new Error('Invalid segmentation grid dimensions.');}
 }
}

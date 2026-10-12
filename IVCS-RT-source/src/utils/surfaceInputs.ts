import type {StructureRoi} from '../types';
import {maskScale} from './segmentationGrid';
export function sameSurfaceInputs(a:StructureRoi[],b:StructureRoi[]){
 return a.length===b.length && a.every((r,i)=>r.id===b[i].id && r.sliceMasks===b[i].sliceMasks && maskScale(r)===maskScale(b[i]));
}

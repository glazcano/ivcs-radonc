import type {StructureRoi} from '../types';

/** Masks are immutable and shared. Count unique backing buffers, not ROI references. */
export function trimContourHistory(states:StructureRoi[][],budget=256*1024*1024,maxStates=50):StructureRoi[][] {
  const seen=new Set<ArrayBufferLike>();let bytes=0,start=states.length;
  for(let i=states.length-1;i>=0 && states.length-i<=maxStates;i--){
    const added=new Set<ArrayBufferLike>();
    for(const roi of states[i])for(const mask of Object.values(roi.sliceMasks))if(!seen.has(mask.buffer))added.add(mask.buffer);
    const cost=[...added].reduce((sum,b)=>sum+b.byteLength,0);
    if(bytes+cost>budget)break;
    added.forEach(b=>seen.add(b));bytes+=cost;start=i;
  }
  return states.slice(start);
}

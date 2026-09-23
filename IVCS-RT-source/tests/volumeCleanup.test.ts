import {test} from 'node:test';import assert from 'node:assert/strict';
import {cleanupVolume,CleanupInput} from '../src/utils/volumeCleanup';
import {planeMask,writePlaneMask} from '../src/utils/panelPlane';
import type {DicomSeries,StructureRoi} from '../src/types';
const fixture=():CleanupInput=>({cols:9,rows:9,depth:9,spacing:[1,1,3],masks:{},method:'none',radiusMm:1,minComponentMm3:0,fillHoles:false});
function put(p:CleanupInput,x:number,y:number,z:number,value=1){p.masks[z]??=new Uint8Array(p.cols*p.rows);p.masks[z][y*p.cols+x]=value;}
test('3D cleanup preserves disconnected organs by default and removes only components below physical threshold',()=>{
 const p=fixture();put(p,2,2,2);put(p,5,5,5);put(p,6,5,5);
 const a=cleanupVolume(p);assert.equal(a.after,3);assert.equal(a.added+a.removed,0);
 const b=cleanupVolume({...p,minComponentMm3:4});assert.equal(b.after,2);assert.equal(b.removedComponents,1);assert.equal(p.masks[2][20],1);
});
test('3D median respects anisotropy and removes isolated voxels without smoothing between thick slices',()=>{
 const p=fixture();p.method='median';p.masks[4]=new Uint8Array(81).fill(1);put(p,2,2,1);
 const r=cleanupVolume(p);assert.equal(r.masks[4][40],1);assert.equal(r.masks[3],undefined);assert.equal(r.masks[1],undefined);
});
test('3D enclosed cavity filling preserves diagonal exterior channels and unsupported voxels',()=>{
 const p=fixture();for(let z=2;z<=6;z++)for(let y=2;y<=6;y++)for(let x=2;x<=6;x++)put(p,x,y,z);
 put(p,4,4,4,0);p.fillHoles=true;assert.equal(cleanupVolume(p).added,1);
 put(p,3,3,3,0);put(p,2,2,2,0);assert.equal(cleanupVolume(p).added,0);
 put(p,3,3,3);put(p,2,2,2);p.valid={4:new Uint8Array(81).fill(1)};p.valid[4][40]=0;assert.equal(cleanupVolume(p).added,0);
});
test('opening only removes and closing only adds even at volume boundaries; invalid input rejected',()=>{
 const p=fixture();for(let z=0;z<3;z++)for(let y=0;y<4;y++)for(let x=0;x<4;x++)put(p,x,y,z);put(p,1,1,1,0);
 assert.equal(cleanupVolume({...p,method:'opening'}).added,0);assert.equal(cleanupVolume({...p,method:'closing'}).removed,0);
 assert.throws(()=>cleanupVolume({...p,radiusMm:NaN}));assert.throws(()=>cleanupVolume({...p,spacing:[0,1,1]}));
});
test('all three editing planes round-trip into correct axial voxels, preserve untouched slices and respect valid support',()=>{
 const series={slices:Array.from({length:5},(_,z)=>({rows:4,cols:6,valid:new Uint8Array(24).fill(1)}))} as DicomSeries;
 const roi={id:"roi",name:"Synthetic",type:"OAR",color:"#ff0000",opacity:.5,visible:true,locked:false,sliceMasks:{0:new Uint8Array(24).fill(1)}} as StructureRoi,coords={x:2,y:1,z:3};
 for(const plane of ['axial','coronal','sagittal'] as const){
  const source=planeMask(series,coords,plane,roi),mask=source?.slice()||new Uint8Array(24);mask[1]=1;
  const updates=writePlaneMask(series,coords,plane,roi,mask),next={...roi,sliceMasks:{...roi.sliceMasks,...updates}};
  assert.deepEqual(planeMask(series,coords,plane,next),mask);
  assert.equal(next.sliceMasks[0],roi.sliceMasks[0]);
 }
 series.slices[4].valid![8]=0;const mask=new Uint8Array(4*5);mask[1]=1;
 assert.deepEqual(writePlaneMask(series,coords,'sagittal',roi,mask)[4],undefined);
});

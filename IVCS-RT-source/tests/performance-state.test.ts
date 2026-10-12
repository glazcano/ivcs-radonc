import test from 'node:test';import assert from 'node:assert/strict';
import {trimContourTimelines} from '../src/utils/contourHistory';
import {sameSurfaceInputs} from '../src/utils/surfaceInputs';
const roi=(masks:Record<number,Uint8Array>,extra:any={})=>({id:'r',maskScale:1,sliceMasks:masks,...extra}) as any;
test('joint history charges only additional buffers and preserves newest contiguous states',()=>{
 const live=new Uint8Array(1024),old=new Uint8Array(8),older=new Uint8Array(16),future=new Uint8Array(8);
 const active=[roi({0:live})],a=[roi({0:live,1:old})],b=[roi({0:live,1:older})],c=[roi({0:live,1:future})];
 const undo=[b,a],redo=[c];let result=trimContourTimelines(undo,redo,active,16);
 assert.deepEqual(result.undo,[a]);assert.equal(result.redo,redo);
 assert.equal(trimContourTimelines([active],[],active,0).undo.length,1);
 assert.equal(trimContourTimelines([[roi({0:live})]],[],[],16).undo.length,0);
 assert.equal(trimContourTimelines([a,a],[a],active,8).undo.length,2);
 assert.equal(trimContourTimelines([a,a,a],[],active,8,2).undo.length,2);
});
test('3D presentation changes retain surface identity; mask edits and resolution invalidate it',()=>{
 const r=roi({0:new Uint8Array(4)});
 assert.equal(sameSurfaceInputs([r],[{...r,color:'red',name:'Renamed',locked:true,opacity:0}]),true);
 assert.equal(sameSurfaceInputs([r],[{...r,sliceMasks:{0:new Uint8Array(4)}}]),false);
 assert.equal(sameSurfaceInputs([r],[{...r,maskScale:2}]),false);
 assert.equal(sameSurfaceInputs([r],[]),false);
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {contourSurface} from '../src/utils/contourSurface';
test('3D surface merges a solid block into six faces with exact physical bounds',()=>{
 const masks={0:new Uint8Array(6).fill(1),1:new Uint8Array(6).fill(1)},mesh=contourSurface({cols:3,rows:2,depth:2,spacing:[2,3,4],origin:[10,20,30],masks});assert.equal(mesh.positions.length,6*6*3);
 for(let axis=0;axis<3;axis++){const points=Array.from(mesh.positions).filter((_,i)=>i%3===axis);assert.equal(Math.min(...points),[9,18.5,28][axis]);assert.equal(Math.max(...points),[15,24.5,36][axis]);}
});
test('3D surface preserves holes and leaves source masks unchanged',()=>{
 const mask=new Uint8Array(9).fill(1);mask[4]=0;const before=mask.slice();const mesh=contourSurface({cols:3,rows:3,depth:1,spacing:[1,1,1],origin:[0,0,0],masks:{0:mask}});assert.deepEqual(mask,before);assert.ok(mesh.positions.length>108);assert.equal(contourSurface({cols:2,rows:2,depth:2,spacing:[1,1,1],origin:[0,0,0],masks:{}}).positions.length,0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strokeBrushLine, getMaskBoundingBox, getMaskVoxelCount, hasMaskContour } from '../src/utils/contourEngine';
import { getRecent, putBounded, bitmapBytes } from '../src/utils/renderCache';

test('live stroke bounds follow the brush outside the initial rendered area',()=> {
  const mask=new Uint8Array(128*128);
  strokeBrushLine(mask,128,128,20,40,20,40,3,1);
  const initial=getMaskBoundingBox(mask,128,128)!;
  const count=getMaskVoxelCount(mask);
  strokeBrushLine(mask,128,128,20,40,100,40,3,1);
  const grown=getMaskBoundingBox(mask,128,128)!;
  assert.ok(grown.maxC > initial.maxC, 'cached bounds clipped the growing stroke');
  assert.ok(grown.maxC >= 102);
  assert.ok(getMaskVoxelCount(mask) > count);
});

test('cached empty mask becomes visible when painted and empty again when erased',()=> {
  const mask=new Uint8Array(64*64);
  assert.equal(getMaskBoundingBox(mask,64,64),null);
  assert.equal(hasMaskContour(mask),false);
  strokeBrushLine(mask,64,64,20,20,40,20,3,1);
  assert.equal(hasMaskContour(mask),true);
  assert.ok(getMaskBoundingBox(mask,64,64));
  strokeBrushLine(mask,64,64,20,20,40,20,4,0);
  assert.equal(getMaskBoundingBox(mask,64,64),null);
  assert.equal(getMaskVoxelCount(mask),0);
});

test('distant input samples form an unbroken stroke without changing original mask',()=> {
  const original=new Uint8Array(128*128), mask=original.slice();
  strokeBrushLine(mask,128,128,5,50,120,50,2,1);
  for(let x=5;x<120;x++) assert.equal(mask[50*128+x],1);
  assert.equal(original.some(Boolean),false);
});

test('bitmap cache honors bytes and keeps recently accessed images',()=> {
  const cache=new Map<string,{width:number;height:number}>();
  const image={width:512,height:512};
  putBounded(cache,'a',image,2*1024*1024,bitmapBytes);
  putBounded(cache,'b',image,2*1024*1024,bitmapBytes);
  getRecent(cache,'a');
  putBounded(cache,'c',image,2*1024*1024,bitmapBytes);
  assert.deepEqual([...cache.keys()],['a','c']);
  putBounded(cache,'large',{width:2048,height:2048},2*1024*1024,bitmapBytes);
  assert.equal(cache.size,0);
});

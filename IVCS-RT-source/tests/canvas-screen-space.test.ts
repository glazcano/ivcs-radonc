import test from 'node:test';import assert from 'node:assert/strict';import {inCanvasScreenSpace} from '../src/utils/canvasScreenSpace';
test('screen annotations retain anchors and round CSS geometry under anisotropy and backing scale',()=>{
 let saved=0,restored=0,set:any;const ctx:any={canvas:{width:800,height:600,clientWidth:400,clientHeight:300},getTransform:()=>({a:6,b:0,c:0,d:18,e:100,f:80}),save:()=>saved++,restore:()=>restored++,setTransform:(...args:any[])=>set=args};
 inCanvasScreenSpace(ctx,(point,scale)=>{assert.deepEqual(point(10,20),{x:80,y:220});assert.equal(scale,3);assert.deepEqual(set,[2,0,0,2,0,0]);});
 assert.equal(saved,1);assert.equal(restored,1);
 assert.throws(()=>inCanvasScreenSpace(ctx,()=>{throw new Error('test');}));assert.equal(restored,2);
});

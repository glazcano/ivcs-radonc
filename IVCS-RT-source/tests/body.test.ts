import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bodyMargin, filterBodyComponents, refineBodyContinuity,reviewBody,selectBodyReplacement} from '../src/utils/bodyAlgorithms';
import {generateBodyMaskForSlice as body,generateBodyVolumeForSeries,generateAsymmetricMargin2D,createUniformMargin} from '../src/utils/contourEngine';
import type {DicomSlice,DicomSeries,StructureRoi} from '../src/types';

function slice(n=128,spacing:[number,number]=[1,1],z=0):DicomSlice {
  return {id:'synthetic-'+z,sliceIndex:z,rows:n,cols:n,huData:new Int16Array(n*n).fill(-1000),pixelSpacing:spacing,sliceThickness:1,sliceLocation:z,
    imagePositionPatient:[0,0,z],imageOrientationPatient:[1,0,0,0,1,0],minHU:-1000,maxHU:0,windowCenter:40,windowWidth:400,rescaleSlope:1,rescaleIntercept:0};
}
function rect(s:DicomSlice,r:number,c:number,h:number,w:number,hu=0){for(let y=r;y<r+h;y++)for(let x=c;x<c+w;x++)s.huData[y*s.cols+x]=hu;}
const count=(m:Uint8Array)=>m.reduce((a,b)=>a+b,0);
const plain={disconnectTableBridge:false,closingRadiusMm:0,smoothSkinPerimeter:false,fillHoles:false};

test('BODY retains small main anatomy and separated limbs; removes a couch-only image',()=>{
  const s=slice();rect(s,40,40,15,20);assert.equal(count(body(s,plain)),300);
  const limbs=slice(256);rect(limbs,40,70,100,100);rect(limbs,50,20,40,20);assert.equal(count(body(limbs,plain)),10800);
  const table=slice();rect(table,100,10,8,100);assert.equal(count(body(table,plain)),0);
});

test('secondary area and couch aspect use physical millimetres',()=>{
  for(const spacing of [[1,1],[.5,.5],[2,.5]] as [number,number][]){
    const s=slice(128,spacing);rect(s,10,10,20/spacing[0],20/spacing[1]);rect(s,60,60,4/spacing[0],4/spacing[1]);
    assert.equal(count(body(s,{...plain,minComponentAreaMm2:20}))*spacing[0]*spacing[1],400);
  }
  const s=slice(128,[4,1]);rect(s,100,10,8,40);assert.equal(count(body(s,plain)),320);
});

test('distance morphology exactly matches disk margins, including anisotropic image boundaries',()=>{
  let seed=94;
  for(const spacing of [[1,1],[2,.5],[.7,1.3],[1.00001,1.00001]] as [number,number][])for(const radius of [-3,-1,1,3]){
    const mask=Uint8Array.from({length:32*32},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%9<7?1:0;});
    assert.deepEqual(bodyMargin(mask,32,32,spacing,radius),generateAsymmetricMargin2D(mask,32,32,createUniformMargin(radius),spacing));
    for(const full of [new Uint8Array(1024),new Uint8Array(1024).fill(1)])assert.deepEqual(bodyMargin(full,32,32,spacing,radius),generateAsymmetricMargin2D(full,32,32,createUniformMargin(radius),spacing));
  }
});

test('closing precedes cavity fill and does not retract anatomy clipped by the field',()=>{
  const s=slice(64);rect(s,10,10,40,40);rect(s,15,15,30,30,-1000);rect(s,10,30,6,1,-1000);
  const mask=body(s,{...plain,closingRadiusMm:2,fillHoles:true,suppressCouch:false});assert.equal(mask[30*64+30],1);
  const clipped=slice(64);rect(clipped,0,0,40,40);
  const out=body(clipped,{...plain,closingRadiusMm:2,suppressCouch:false});assert.equal(out[0],1);assert.equal(out[20*64],1);
});

test('local couch opening leaves distant thin anatomy intact; manual line is enforced after expansion',()=>{
  const s=slice(128);rect(s,10,20,50,40);rect(s,10,60,2,20);rect(s,100,5,8,118);
  const before=body(s,plain),after=body(s,{...plain,disconnectTableBridge:true});
  assert.deepEqual(after.subarray(0,80*128),before.subarray(0,80*128));
  const manual=body(s,{...plain,tableExclusionFraction:.5,marginMm:5});assert.equal(count(manual.subarray(64*128)),0);
  assert.equal(count(body(s,{tableExclusionRow:0})),0);
});

test('continuity retains a supported small island and rejects an isolated one without changing input',async()=>{
  const slices=Array.from({length:3},(_,z)=>{const s=slice(64,[1,1],z);rect(s,10,10,20,20);rect(s,40,40,3,3);if(z===1)rect(s,50,20,3,3);return s;});
  const masks=Object.fromEntries(slices.map(s=>[s.sliceIndex,body(s,{...plain,minComponentAreaMm2:0})]));
  const copy=masks[1].slice(),result=refineBodyContinuity(slices,masks,20);
  assert.equal(result[1][41*64+41],1);assert.equal(result[1][51*64+21],0);assert.deepEqual(masks[1],copy);
  const series={slices} as DicomSeries,volume=await generateBodyVolumeForSeries(series,plain);assert.deepEqual(volume[1],result[1]);
  slices[2]={...slices[2],imagePositionPatient:[10,0,2]};assert.equal(refineBodyContinuity(slices,masks,20)[1][41*64+41],0);
});

test('review flags empty cuts, border contact, multiple islands and sudden area changes',()=>{
  const slices=Array.from({length:3},(_,z)=>slice(64,[1,1],z));rect(slices[0],0,0,20,20);rect(slices[0],40,40,5,5);rect(slices[1],20,20,5,5);
  const masks=Object.fromEntries(slices.map(s=>[s.sliceIndex,body(s,plain)])),review=reviewBody(slices,masks);
  assert.ok(review[0].reasons.includes('Contacto con el borde de imagen'));assert.ok(review[0].reasons.includes('Varios componentes'));
  assert.ok(review[1].reasons.includes('Cambio brusco de área'));assert.ok(review[2].reasons.includes('Sin contorno'));
});

test('acceptance refuses locked or missing destinations and preserves all existing nonempty cuts',()=>{
  const target={locked:true,sliceMasks:{0:new Uint8Array([1]),1:new Uint8Array([0])}} as unknown as StructureRoi;
  const masks={0:new Uint8Array([0]),1:new Uint8Array([1]),2:new Uint8Array([1])};
  assert.throws(()=>selectBodyReplacement(target,masks,false),/bloqueada/);assert.throws(()=>selectBodyReplacement(undefined,masks,false),/no existe/);
  target.locked=false;assert.deepEqual(Object.keys(selectBodyReplacement(target,masks,true)),['1','2']);
  assert.deepEqual(Object.keys(selectBodyReplacement(target,masks,false)),['0','1','2']);assert.equal(target.sliceMasks[0][0],1);
});

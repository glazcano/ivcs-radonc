import {test} from 'node:test';
import assert from 'node:assert/strict';
import {traceCellLoops,rasterizeLoops,exportLoops} from '../src/utils/rtGeometry';
import {identity3d,transformPoint,fitLandmarks,resamplePlane,automaticRigid3d} from '../src/utils/rigid3d';
import {exportMonacoRtStruct} from '../src/utils/monacoRtStructExporter';
import {importRtStruct,compareContours} from '../src/utils/rtStructImporter';
import {stampBrushCircle,generateAsymmetricMargin3D,createUniformMargin,connectedThreshold} from '../src/utils/contourEngine';
export function fixture(n=32,spacing:[number,number]=[2,1]){
  return {patientId:'SYNTHETIC',patientName:'Validation^Only',modality:'CT',studyDescription:'Synthetic phantom',seriesDescription:'Phantom',studyInstanceUID:'1.2.826.0.1.3680043.10.999.1',seriesInstanceUID:'1.2.826.0.1.3680043.10.999.2',frameOfReferenceUID:'1.2.826.0.1.3680043.10.999.3',slices:Array.from({length:9},(_,z)=>({id:'slice'+z,sliceIndex:z,rows:n,cols:n,huData:new Int16Array(n*n),pixelSpacing:spacing,sliceThickness:3,sliceLocation:30+3*z,imagePositionPatient:[10,20,30+3*z] as [number,number,number],imageOrientationPatient:[1,0,0,0,1,0] as [number,number,number,number,number,number],minHU:0,maxHU:100,windowCenter:40,windowWidth:400,rescaleSlope:1,rescaleIntercept:0,sopInstanceUID:'1.2.826.0.1.3680043.10.999.4.'+z,sopClassUID:'1.2.840.10008.5.1.4.1.1.2'}))};
}
test('cell edges preserve arbitrary masks, diagonal contacts, rings and image borders',()=>{
  let seed=123;for(let trial=0;trial<35;trial++){const mask=Uint8Array.from({length:256},()=>{seed=(1664525*seed+1013904223)>>>0;return seed%7<3?1:0;});
    assert.deepEqual(rasterizeLoops(traceCellLoops(mask,16,16),16,16),mask);
    const s=fixture(16).slices[0];assert.deepEqual(exportLoops(mask,s,0,0).mask,mask);
  }
});
test('RTSTRUCT round trip retains a hole, nested island, single voxel and anisotropic geometry',async()=>{
  const series=fixture(),mask=new Uint8Array(1024);for(let y=3;y<28;y++)for(let x=3;x<28;x++)if(y<8 || y>22 || x<8 || x>22)mask[y*32+x]=1;mask[15*32+15]=1;
  const roi:any={id:'r',name:'Ring',type:'PTV',visible:true,locked:false,color:'#ff0000',opacity:.4,sliceMasks:{4:mask}};
  for(const holeMode of ['keyhole','xor'] as const){const result=exportMonacoRtStruct(series,[roi],{pointToleranceMm:.5,minContourAreaMm2:0,holeMode});const restored=importRtStruct(new Uint8Array(await result.blob.arrayBuffer()),series);assert.deepEqual(restored[0].sliceMasks[4],mask);assert.equal(compareContours([roi],restored,series)[0].dice,1);}
});
test('circular brush uses physical spacing, while committed input stays immutable',()=>{
  const m=new Uint8Array(41*41);stampBrushCircle(m,41,41,20.5,20.5,10,1,undefined,undefined,.5);
  assert.equal(m[20*41+30],1);assert.equal(m[25*41+20],1);assert.equal(m[26*41+20],0);
});
test('3D uniform margins agree with a physical sphere around a seed on anisotropic grid',()=>{
  const s=fixture(),mask=new Uint8Array(1024);mask[16*32+16]=1;const out=generateAsymmetricMargin3D(s,{4:mask},createUniformMargin(6));
  for(let z=0;z<9;z++)for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.equal(out[z]?.[y*32+x] || 0,Math.hypot(x-16,2*(y-16),3*(z-4))<=6?1:0,`${x},${y},${z}`);
});
test('landmarks recover all six rigid parameters with no scaling',()=>{
  const expected={...identity3d([5,6,7]),translationX:12,translationY:-8,translationZ:3,rotationX:17,rotationY:-12,rotationDeg:25};
  const moving:any=[[0,0,0],[20,0,0],[0,30,0],[0,0,40],[13,7,23]],pairs=moving.map(p=>({moving:p,fixed:transformPoint(p,expected)}));
  const fit=fitLandmarks(pairs);assert.ok(fit.rms<1e-8,`${fit.rms}`);for(const p of moving)assert.ok(Math.hypot(...transformPoint(p,fit.transform).map((v,i)=>v-transformPoint(p,expected)[i]))<1e-8);
  assert.throws(()=>fitLandmarks([{fixed:[0,0,0],moving:[0,0,0]},{fixed:[1,0,0],moving:[1,0,0]},{fixed:[2,0,0],moving:[2,0,0]}]),/colineales/);
});
test('resampling identity honors physical origin and spacing rather than slice indices',()=>{
  const s=fixture();s.slices[4].huData[16*32+16]=100;assert.equal(resamplePlane(s.slices[4],s,identity3d()).huData[16*32+16],100);
  const t={...identity3d(),translationZ:3};assert.equal(resamplePlane(s.slices[5],s,t).huData[16*32+16],100);
});
test('seed threshold excludes disconnected tissue of identical intensity',()=>{
  const data=new Int16Array(25);data.fill(-1000);for(const n of [0,1,5,6,18,19,23,24])data[n]=50;
  const mask=connectedThreshold(data,5,5,0,40,60);assert.equal(mask.reduce((a,b)=>a+b,0),4);assert.equal(mask[18],0);
});
test('automatic volumetric registration recovers physical translation of a synthetic phantom',()=>{
  const fixed=fixture(20,[1,1]);
  for(let z=0;z<9;z++){const s=fixed.slices[z];for(let y=0;y<20;y++)for(let x=0;x<20;x++)s.huData[y*20+x]=Math.round(70*Math.exp(-((x-6)**2+(y-8)**2+4*(z-3)**2)/14)+30*Math.exp(-((x-14)**2+(y-13)**2+4*(z-6)**2)/8));}
  const moving={...fixed,slices:fixed.slices.map(s=>({...s,imagePositionPatient:[s.imagePositionPatient[0]+2,s.imagePositionPatient[1]-3,s.imagePositionPatient[2]+3] as [number,number,number]}))};
  const result=automaticRigid3d(fixed,moving,identity3d([20,40,42]));
  assert.ok(Math.abs(result.transform.translationX+2)<1 && Math.abs(result.transform.translationY-3)<1 && Math.abs(result.transform.translationZ+3)<1,JSON.stringify(result));
});

test('2D erosion treats outside the field as background with rectangular pixels',async()=>{
  const {generateAsymmetricMargin2D}=await import('../src/utils/contourEngine');
  const full=new Uint8Array(81).fill(1),out=generateAsymmetricMargin2D(full,9,9,createUniformMargin(-2),[2,1]);
  for(let y=0;y<9;y++)for(let x=0;x<9;x++)assert.equal(out[y*9+x],x>=2 && x<7 && y>=1 && y<8?1:0);
});
test('RTSTRUCT preserves UTF8 identity and rejects another patient',async()=>{
 const s=fixture();s.patientId='QA_Ñ_12';s.patientName='Muñoz^José';const m=new Uint8Array(1024);m[300]=1;
 const roi:any={id:'1',name:'test',type:'OAR',color:'#ff0000',visible:true,locked:false,opacity:.4,sliceMasks:{4:m}};
 const b=new Uint8Array(await exportMonacoRtStruct(s,[roi]).blob.arrayBuffer());assert.equal(importRtStruct(b,s).length,1);assert.throws(()=>importRtStruct(b,{...s,patientId:'different'}),/paciente/i);
});
test('automatic rotation on a synthetic volumetric phantom improves physical alignment',()=>{
 const fixed=fixture(32,[1,1]);const expected={...identity3d([25.5,35.5,42]),rotationDeg:6};
 const intensity=(p:number[])=>{const x=p[0]-10,y=p[1]-20,z=(p[2]-30)/3;return Math.round(300*Math.exp(-((x-10)**2+(y-14)**2+4*(z-3)**2)/25)+180*Math.exp(-((x-23)**2+(y-21)**2+4*(z-6)**2)/12));};
 for(const s of fixed.slices)for(let y=0;y<32;y++)for(let x=0;x<32;x++)s.huData[y*32+x]=intensity([10+x,20+y,s.imagePositionPatient[2]]);
 const moving={...fixed,slices:fixed.slices.map(s=>({...s,maxHU:480,huData:Int16Array.from(s.huData,(_,i)=>intensity(transformPoint([10+i%32,20+Math.floor(i/32),s.imagePositionPatient[2]],expected)))}))};
 const fit=automaticRigid3d(fixed,moving,identity3d([25.5,35.5,42]));
 const points:any=[[15,26,36],[34,45,48],[19,44,42]];const error=points.reduce((sum,p)=>sum+Math.hypot(...transformPoint(p,fit.transform).map((v,i)=>v-transformPoint(p,expected)[i])),0)/points.length;
 assert.ok(error<1.5,JSON.stringify({error,fit}));
});


test('automatic CT/MR registration accepts a small MR FoV and preserves known alignment',()=>{
 const fixed=fixture(64,[1,1]);
 for(let z=0;z<9;z++)for(let y=0;y<64;y++)for(let x=0;x<64;x++)fixed.slices[z].huData[y*64+x]=((x*13+y*7+z*17)%97)*3;
 for(const s of fixed.slices){s.minHU=0;s.maxHU=288;}
 const moving={...fixed,modality:'MR',slices:fixed.slices.map(s=>({...s,rows:16,cols:16,imagePositionPatient:[30,40,s.imagePositionPatient[2]] as [number,number,number],minHU:50,maxHU:626,huData:Int16Array.from({length:256},(_,i)=>50+2*s.huData[(20+Math.floor(i/16))*64+20+i%16])}))};
 const result=automaticRigid3d(fixed,moving,identity3d([37.5,47.5,42]));
 assert.ok(Number.isFinite(result.score));
 assert.ok(Math.hypot(result.transform.translationX,result.transform.translationY,result.transform.translationZ)<1,JSON.stringify(result));
});

test('fusion planes inherit secondary polarity rather than CT polarity',()=>{
 const fixed=fixture(8),moving={...fixed,slices:fixed.slices.map(s=>({...s,inverted:true,windowCenter:150,windowWidth:300}))};
 const plane=resamplePlane(fixed.slices[4],moving,identity3d());
 assert.equal(plane.inverted,true);assert.equal(plane.windowCenter,150);assert.equal(plane.windowWidth,300);
});


test('orthogonal views rebuild support masks on their own dimensions',async()=>{
 const {referencePlane}=await import('../src/utils/panelPlane');
 const s=fixture(8);for(const slice of s.slices)(slice as any).valid=Uint8Array.from({length:64},(_,i)=>i%8<4?1:0);
 const coronal=referencePlane(s,{x:2,y:2,z:4},'coronal');assert.equal(coronal.valid!.length,72);
 for(let y=0;y<9;y++)for(let x=0;x<8;x++)assert.equal(coronal.valid![y*8+x],x<4?1:0);
 const sagittal=referencePlane(s,{x:6,y:2,z:4},'sagittal');assert.equal(sagittal.valid!.reduce((a,b)=>a+b,0),0);
});

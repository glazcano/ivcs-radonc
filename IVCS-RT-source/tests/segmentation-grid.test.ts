import test from 'node:test';
import assert from 'node:assert/strict';
import dicomParser from 'dicom-parser';
import type {DicomSeries,StructureRoi} from '../src/types';
import {maskGeometry,maskSeries,roiAtScale,maskScale,validateMaskGrids} from '../src/utils/segmentationGrid';
import {planeMask,referencePlane,writePlaneMask} from '../src/utils/panelPlane';
import {patientPoint} from '../src/utils/geometry';
import {calculateRoiVolumeCm3,calculateRoiHuStats,generateAsymmetricMargin3D,createUniformMargin,applyBooleanOperationToMasks} from '../src/utils/contourEngine';
import {exportMonacoRtStruct} from '../src/utils/monacoRtStructExporter';
import {importRtStruct,compareContours} from '../src/utils/rtStructImporter';
import {sessionRecords,readSessionFile} from '../src/utils/sessionStream';
import {serializeSession,parseSession} from '../src/utils/session';
import {defaultRegistration,encodeLibrary,decodeLibrary} from '../src/utils/libraryClient';
import {cleanupVolume} from '../src/utils/volumeCleanup';
import {contourSurface} from '../src/utils/contourSurface';
import {unionPhaseMasks} from '../src/utils/temporal';
import {calculateRoiCentroid} from '../src/utils/mprEngine';
const fixture=(n=8):DicomSeries=>({patientId:'SYNTHETIC-GRID',patientName:'Synthetic^Grid',modality:'CT',studyDescription:'QA',seriesDescription:'QA',studyInstanceUID:'2.25.1',seriesInstanceUID:'2.25.2',frameOfReferenceUID:'2.25.3',slices:Array.from({length:5},(_,z)=>({id:'z'+z,sliceIndex:z,rows:n,cols:n,huData:Int16Array.from({length:n*n},(_,i)=>i),pixelSpacing:[2,1],sliceThickness:3,sliceLocation:30+3*z,imagePositionPatient:[10,20,30+3*z],imageOrientationPatient:[1,0,0,0,1,0],minHU:0,maxHU:1000,windowCenter:40,windowWidth:400,rescaleSlope:1,rescaleIntercept:0,sopInstanceUID:'2.25.100.'+z,sopClassUID:'1.2.840.10008.5.1.4.1.1.2'}))});
const roi=(s:DicomSeries):StructureRoi=>({id:'test',name:'Test',type:'OAR',color:'#ff0000',visible:true,locked:false,opacity:.4,sliceMasks:{2:Uint8Array.from({length:s.slices[0].rows*s.slices[0].cols},(_,i)=>i===19?1:0)}});

test('2x keeps physical cell bounds, original images, volume, HU statistics and centroids',()=>{
 const s=fixture(),r=roi(s),h=roiAtScale(r,s,2),g=maskGeometry(s.slices[0],2);
 assert.deepEqual(patientPoint(g,-.5,-.5),patientPoint(s.slices[0],-.5,-.5));
 assert.deepEqual(patientPoint(g,15.5,15.5),patientPoint(s.slices[0],7.5,7.5));
 assert.equal(g.huData,s.slices[0].huData);assert.equal(g.sopInstanceUID,s.slices[0].sopInstanceUID);
 assert.equal(h.sliceMasks[2].reduce((a,b)=>a+b),4);assert.equal(calculateRoiVolumeCm3(r,s.slices),calculateRoiVolumeCm3(h,s.slices));
 const a=calculateRoiHuStats(r,s.slices),b=calculateRoiHuStats(h,s.slices);assert.equal(a.meanHU,b.meanHU);assert.equal(a.volumeCm3,b.volumeCm3);assert.equal(b.meanHU,19);
 assert.deepEqual(calculateRoiCentroid(h,8,8,5),{x:3,y:2,z:2});
 assert.throws(()=>roiAtScale(h,s,1),/Reducing/);assert.equal(r.maskScale,undefined);
 const rotated={...s.slices[0],imageOrientationPatient:[0,1,0,0,0,1] as [number,number,number,number,number,number]};assert.deepEqual(patientPoint(maskGeometry(rotated,2),-.5,-.5),patientPoint(rotated,-.5,-.5));
});

test('subpixel edits round-trip in every plane, including native support and immutable untouched slices',()=>{
 const s=fixture(),r=roiAtScale(roi(s),s,2),coords={x:2.25,y:1.75,z:3};
 for(const plane of ['axial','coronal','sagittal'] as const){const view=referencePlane(s,coords,plane,2),m=planeMask(s,coords,plane,r)?.slice()||new Uint8Array(view.rows*view.cols);m[3]=1;
 const changes=writePlaneMask(s,coords,plane,r,m),next={...r,sliceMasks:{...r.sliceMasks,...changes}};assert.deepEqual(planeMask(s,coords,plane,next),m);assert.equal(next.sliceMasks[2],r.sliceMasks[2]);assert.equal(view.huData.length,view.rows*view.cols);}
 s.slices[3].valid=new Uint8Array(64).fill(1);s.slices[3].valid![0]=0;const m=new Uint8Array(256);m[0]=m[1]=m[16]=m[17]=1;assert.deepEqual(writePlaneMask(s,coords,'axial',r,m),{});
 const p=referencePlane(s,coords,'axial',2);assert.equal(p.valid![0],0);assert.equal(p.huData[4*16+4],15.75);
});

test('mixed grids preserve subpixels through physical margins, booleans, cleanup, ITV and 3D',()=>{
 const s=fixture(),h=roiAtScale({...roi(s),sliceMasks:{}},s,2);h.sliceMasks[2]=new Uint8Array(256);h.sliceMasks[2][6*16+6]=1;
 const grid=maskSeries(s,2),margin=generateAsymmetricMargin3D(grid,h.sliceMasks,createUniformMargin(1));assert.equal(margin[2][6*16+8],1);assert.equal(margin[2][6*16+9],0);assert.equal(margin[1]?.some(Boolean)||false,false);
 const a=roiAtScale(roi(s),s,2);assert.deepEqual(applyBooleanOperationToMasks(a.sliceMasks[2],a.sliceMasks[2],'union'),a.sliceMasks[2]);
 assert.deepEqual(unionPhaseMasks(s,[{series:s,roi:h}],2),h.sliceMasks);
 const valid=new Uint8Array(64).fill(1);valid[3*8+3]=0;const cleaned=cleanupVolume({cols:16,rows:16,depth:5,spacing:[.5,1,3],masks:h.sliceMasks,valid:{2:valid},validScale:2,method:'none',radiusMm:0,minComponentMm3:0,fillHoles:false});assert.equal(cleaned.after,0);
 const geometry=maskGeometry(s.slices[0],2),surface=contourSurface({cols:16,rows:16,depth:5,spacing:[.5,1,3],origin:geometry.imagePositionPatient!,masks:h.sliceMasks});const xs=surface.positions.filter((_,i)=>i%3===0);assert.equal(Math.min(...xs),12.5);assert.equal(Math.max(...xs),13);
});

test('legacy and 2x masks survive streamed, JSON and library codecs without changing image arrays',async()=>{
 const s=fixture(),r=roi(s),h={...roiAtScale(r,s,2),id:'high'},study={...s,id:'reference'},session:any={format:'radcontour-session',version:1,series:study,studies:[study],rois:[r,h],activeRoiId:h.id,currentSliceIndex:2,windowCenter:40,windowWidth:400,registrationState:defaultRegistration('reference')};
 for(const restored of [await readSessionFile(new Blob([...sessionRecords(session)])),parseSession(serializeSession(session)),decodeLibrary(encodeLibrary(session))]){assert.equal(maskScale(restored.rois[0]),1);assert.equal(maskScale(restored.rois[1]),2);assert.deepEqual(restored.rois[1].sliceMasks,h.sliceMasks);assert.deepEqual(restored.series.slices[2].huData,s.slices[2].huData);validateMaskGrids(restored.rois,restored.series);}
 assert.throws(()=>parseSession(serializeSession({...session,rois:[{...h,maskScale:3}]})),/resolution/);
 assert.throws(()=>validateMaskGrids([{...h,maskScale:1}],s),/dimensions/);
});

test('RTSTRUCT round-trip preserves half-pixel detail, holes, physical coordinates and image references',async()=>{
 const s=fixture(),h=roiAtScale({...roi(s),sliceMasks:{}},s,2),m=new Uint8Array(256);for(let y=1;y<14;y++)for(let x=1;x<14;x++)if(y<3||y>11||x<3||x>11)m[y*16+x]=1;m[7*16+7]=1;h.sliceMasks[2]=m;h.name='High resolution';
 for(const holeMode of ['keyhole','xor'] as const){const result=exportMonacoRtStruct(s,[roi(s),h],{holeMode}),bytes=new Uint8Array(await result.blob.arrayBuffer()),restored=importRtStruct(bytes,s,2);assert.deepEqual(restored[1].sliceMasks[2],m);assert.ok(compareContours([roi(s),h],restored,s).every(r=>r.dice===1&&r.maxBoundaryDistanceMm===0));const ds:any=dicomParser.parseDicom(bytes),item=ds.elements.x30060039.items[1].dataSet,grid=item.elements.x3006004a.items[0].dataSet;assert.equal(grid.uint16('x00280010'),16);assert.equal(grid.string('x00280030'),'1\\0.5');assert.equal(item.elements.x30060040.items[0].dataSet.elements.x30060016.items[0].dataSet.string('x00081155'),s.slices[2].sopInstanceUID);}
});

test('oversized Contour Data uses standard UN without discarding boundary points',async()=>{
 const s=fixture(96),h=roiAtScale({...roi(s),sliceMasks:{}},s,2),w=192,m=new Uint8Array(w*w);
 for(let y=3;y<188;y++){m[y*w+2]=1;if(y%4===0)for(let x=2;x<188;x++){m[y*w+x]=1;if(x%2===0)m[(y-1)*w+x]=1;}}
 h.sliceMasks[2]=m;const b=new Uint8Array(await exportMonacoRtStruct(s,[h]).blob.arrayBuffer()),ds:any=dicomParser.parseDicom(b),contours=ds.elements.x30060039.items[0].dataSet.elements.x30060040.items;
 assert.ok(contours.some((c:any)=>c.dataSet.elements.x30060050.vr==='UN'));
 assert.deepEqual(importRtStruct(b,s,2)[0].sliceMasks[2],m);
});

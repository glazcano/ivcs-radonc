import test from 'node:test';import assert from 'node:assert/strict';
import {sessionRecords,readSessionFile} from '../src/utils/sessionStream';
import {defaultRegistration} from '../src/utils/libraryClient';
import {obliqueFixture} from './helpers/obliqueFixture';
import {resampleAxial,estimateAxialReconstruction} from '../src/utils/axialResampling';
test('Streamed sessions preserve native fractional pixels and masks, with shared reference',async()=>{
 const native=obliqueFixture(),series=await resampleAxial(native),study={...series,id:'reference'};
 const session:any={format:'radcontour-session',version:1,series,studies:[study],rois:[],currentSliceIndex:0,activeRoiId:null,windowCenter:40,windowWidth:400,registrationState:defaultRegistration('reference')};
 const lines=[...sessionRecords(session)],restored=await readSessionFile(new Blob(lines));
 assert.equal(restored.series,restored.studies[0]);
 for(let i=0;i<series.slices.length;i++){assert.deepEqual(restored.series.slices[i].huData,series.slices[i].huData);assert.deepEqual(restored.series.slices[i].valid,series.slices[i].valid);assert.deepEqual(restored.series.slices[i].imagePositionPatient,series.slices[i].imagePositionPatient);}
 assert.deepEqual(restored.series.sourceVolume!.slices,native.slices);
 await assert.rejects(readSessionFile(new Blob(lines.slice(0,-1))),/Incomplete/);
 const reordered=[...lines];[reordered[1],reordered[2]]=[reordered[2],reordered[1]];
 // Different array records may interleave, but offsets within each array cannot repeat.
 await assert.rejects(readSessionFile(new Blob([lines[0],lines[1],...lines.slice(1)])),/Invalid/);
 await assert.rejects(readSessionFile(new Blob([...lines,lines.at(-1)!])),/after/);
});
test('Reconstruction preflight exactly predicts dimensions and allocated voxel bytes',async()=>{
 const native=obliqueFixture(),estimate=estimateAxialReconstruction(native),result=await resampleAxial(native);
 assert.deepEqual(estimate.size,[result.slices[0].cols,result.slices[0].rows,result.slices.length]);
 assert.equal(estimate.workingBytes,result.slices.reduce((n,s)=>n+s.huData.byteLength+s.valid!.byteLength,0));
 assert.equal(estimateAxialReconstruction(native,.001).supported,false);
});

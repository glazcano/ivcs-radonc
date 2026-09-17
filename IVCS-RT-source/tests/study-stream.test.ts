import test from 'node:test';import assert from 'node:assert/strict';import {PassThrough,Readable} from 'node:stream';
import {sendStudyStream} from '../server/studyStream.mjs';import {readStudyStream} from '../src/utils/studyStream';import {encodeLibrary,decodeLibrary} from '../src/utils/libraryClient';
function pipe(){const stream:any=new PassThrough({highWaterMark:64});stream.type=()=>stream;stream.setHeader=()=>{};return stream;}
test('bounded image and mask records preserve arrays and share the selected volume',async()=>{
 const image={id:'synthetic',patientName:'Synthetic^Muñoz',slices:[{huData:new Int16Array([-1024,5,99]),valid:new Uint8Array([1,1,0])}],sourceVolume:{slices:[{huData:new Float32Array([.001,2.5])}]}},state={rois:[{id:'roi',sliceMasks:{0:new Uint8Array([1,0,0])}}]};
 const payload=JSON.parse(encodeLibrary({selected:image,state,revision:'revision'})),stream=pipe();
 const write=sendStudyStream(stream,payload);const result=await readStudyStream(new Response(Readable.toWeb(stream) as any),decodeLibrary);await write;
 assert.equal(result.selected,result.studies[0]);assert.deepEqual(result.selected.slices[0].huData,image.slices[0].huData);assert.deepEqual(result.selected.sourceVolume.slices[0].huData,image.sourceVolume.slices[0].huData);assert.deepEqual(result.state.rois[0].sliceMasks[0],state.rois[0].sliceMasks[0]);assert.equal(result.selected.patientName,image.patientName);assert.equal(result.revision,'revision');
});
test('fragmented UTF8 and JSON records decode without accumulating the full response',async()=>{
 const data=[{kind:'header',format:'ivcs-study-stream',version:1,selected:{patientName:'Synthetic^José',slices:[]},state:null},{kind:'slice',depth:0,index:0,slice:{huData:new Int16Array([10,20])}},{kind:'end',counts:[1],masks:0}].map(encodeLibrary).join('\n'),bytes=new TextEncoder().encode(data);let offset=0;
 const stream=new ReadableStream({pull(c){if(offset===bytes.length){c.close();return;}c.enqueue(bytes.slice(offset,offset+3));offset=Math.min(bytes.length,offset+3);}});
 const result=await readStudyStream(new Response(stream),decodeLibrary);assert.equal(result.selected.patientName,'Synthetic^José');assert.deepEqual([...result.selected.slices[0].huData],[10,20]);
});
test('truncated or out-of-order streams never return a partially opened study',async()=>{
 const header=JSON.stringify({kind:'header',format:'ivcs-study-stream',version:1,selected:{slices:[]},state:null})+'\n';
 await assert.rejects(readStudyStream(new Response(header),decodeLibrary),/Incomplete/);
 await assert.rejects(readStudyStream(new Response(header+JSON.stringify({kind:'slice',depth:0,index:2,slice:{}})),decodeLibrary),/unordered/);
 await assert.rejects(readStudyStream(new Response(header+JSON.stringify({kind:'end',counts:[1],masks:0})),decodeLibrary),/Incomplete/);
});

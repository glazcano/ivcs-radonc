// Explicit stress check; generates no patient files and is not part of the fast suite.
import assert from 'node:assert/strict';import {PassThrough,Readable} from 'node:stream';import {constants} from 'node:buffer';
import {sendStudyStream} from '../server/studyStream.mjs';import {readStudyStream} from '../src/utils/studyStream';import {decodeLibrary} from '../src/utils/libraryClient';
const pixelCount=1024*1024,base64=Buffer.alloc(pixelCount*2,1).toString('base64');
const selected={patientId:'SYNTHETIC-STRESS',slices:Array.from({length:128},(_,sliceIndex)=>({sliceIndex,rows:1024,cols:1024,huData:{array:'i16',base64}}))},payload={selected,studies:[selected],state:null,revision:null};
assert.ok(base64.length*256>constants.MAX_STRING_LENGTH);assert.throws(()=>JSON.stringify(payload),/Invalid string length/i);console.log('Reproduced old duplicated-response failure above V8 string limit.');
const stream:any=new PassThrough({highWaterMark:64*1024});stream.type=()=>stream;stream.setHeader=()=>{};
const write=sendStudyStream(stream,payload),decoded=await readStudyStream(new Response(Readable.toWeb(stream) as any),decodeLibrary);await write;
assert.equal(decoded.selected,decoded.studies[0]);assert.equal(decoded.selected.slices.length,128);
for(const slice of decoded.selected.slices){assert.equal(slice.huData.length,pixelCount);assert.equal(slice.huData[0],257);assert.equal(slice.huData.at(-1),257);}
console.log('PASS: streamed 341 MiB encoded / 256 MiB pixels with one shared selected volume.');

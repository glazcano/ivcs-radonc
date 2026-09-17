import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import codecs from 'dcmjs-codecs';
import JSZip from 'jszip';
import {parseDicomByteArray,parseDicomImage,inspectDicomFiles} from '../src/utils/dicomParser';
const {NativeCodecs,Transcoder}=codecs;
const source=new Uint8Array(readFileSync(new URL('./fixtures/synthetic-ct.dcm',import.meta.url)));
const compress=async(syntax:string)=>{await NativeCodecs.initializeAsync();const t=new Transcoder(source.slice().buffer);t.transcode(syntax);return new Uint8Array(t.getDicomPart10());};
for(const suffix of ['5','4.70','4.80','4.90'])test('lossless '+suffix+' preserves every full-resolution voxel and DICOM reference',async()=>{
 const bytes=await compress('1.2.840.10008.1.2.'+suffix),before=parseDicomByteArray(source),after=await parseDicomImage(bytes,'compressed.dcm');
 assert.deepEqual(after.slice.huData,before.slice.huData);assert.equal(after.slice.rows,256);assert.equal(after.slice.cols,256);
 assert.equal(after.slice.sopInstanceUID,before.slice.sopInstanceUID);assert.deepEqual(after.slice.imagePositionPatient,before.slice.imagePositionPatient);
 assert.equal(after.slice.sourceCompressed,true);assert.equal(after.slice.sourceLossy,false);
});
test('lossy syntax remains flagged after decompression',async()=>{
 const bytes=await compress('1.2.840.10008.1.2.4.91');const parsed=await parseDicomImage(bytes,'lossy.dcm');
 assert.equal(parsed.slice.sourceLossy,true);assert.equal(parsed.slice.sourceTransferSyntax,'1.2.840.10008.1.2.4.91');
});
test('inspection groups ZIP images without decoding and keeps exact original files',async()=>{
 const bytes=await compress('1.2.840.10008.1.2.4.90'),zip=new JSZip();zip.file('folder/ct.dcm',bytes);zip.file('README.txt','synthetic');
 const result=await inspectDicomFiles([new File([await zip.generateAsync({type:'arraybuffer'})],'case.zip')]);
 assert.equal(result.length,1);assert.equal(result[0].compressed,true);assert.equal(result[0].lossy,false);assert.equal(result[0].unsupported,false);
 assert.deepEqual(new Uint8Array(await result[0].files[0].arrayBuffer()),bytes);
 const plain=await inspectDicomFiles([new File([source],'plain.dcm')]);assert.equal(plain[0].compressed,false);
});

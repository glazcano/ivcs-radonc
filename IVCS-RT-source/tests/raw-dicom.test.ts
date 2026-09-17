import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import codecs from 'dcmjs-codecs';import dp from 'dicom-parser';
import {parseDicomByteArray,inspectDicomFiles,parseMultipleDicomFiles} from '../src/utils/dicomParser';import {createLibrary} from '../server/library.mjs';
function raw(acquisition:number,z:number){
 const t=new codecs.Transcoder(new Uint8Array(readFileSync(new URL('./fixtures/synthetic-ct.dcm',import.meta.url))).buffer);t.transcode('1.2.840.10008.1.2');const e=t.getElements();e.AcquisitionNumber=String(acquisition);e.ImagePositionPatient=[-192,-192,z];e.SOPInstanceUID='2.25.20260915.'+acquisition+'.'+(z+100);e.SeriesInstanceUID='2.25.20260915.99';
 const bytes=new Uint8Array(t.getDicomPart10()),ds=dp.parseDicom(bytes),first=Object.values(ds.elements).filter((el:any)=>el.tag>='x00080000').sort((a:any,b:any)=>a.dataOffset-b.dataOffset)[0] as any;
 return bytes.slice(first.dataOffset-8);
}
test('strict raw DICOM fallback preserves pixels and rejects arbitrary bytes',()=>{
 const b=raw(1,0),p=parseDicomByteArray(b);assert.equal(p.slice.sourceRaw,true);assert.equal(p.slice.huData.length,512*128);assert.equal(p.seriesInfo.acquisitionKey,'acq:1');assert.throws(()=>parseDicomByteArray(new Uint8Array(512)),/DICOM/);
});
test('repeated acquisitions are selectable, preserve UIDs and archive separately',async()=>{
 const files=[1,2].flatMap(a=>[0,5,10].map(z=>new File([raw(a,z)],a+'-'+z+'.dcm'))),groups=await inspectDicomFiles(files);assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.files.length),[3,3]);
 const series:any=await parseMultipleDicomFiles(files);assert.equal(series.studies.length,2);assert.equal(series.studies[0].seriesInstanceUID,series.studies[1].seriesInstanceUID);assert.notEqual(series.studies[0].id,series.studies[1].id);
 const only:any=await parseMultipleDicomFiles(groups[1].files,undefined,new Set(groups.map(g=>g.seriesUID!)));assert.equal(only.studies[0].id,series.studies[1].id);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ivcs-acq-')),library=createLibrary(root);
 for(const study of series.studies){const {key}=await library.putStudy({...study,slices:study.slices.map(s=>({...s,huData:Array.from(s.huData)}))});await library.save({key,studyKeys:[key],state:{rois:[{id:study.acquisitionKey,sliceMasks:{}}]}});}
 for(const file of files)await library.originals(series.patientId,Buffer.from(await file.arrayBuffer()),file.name);
 const index=await library.list();assert.equal(index.patients[0].studies.length,2);for(const study of index.patients[0].studies){assert.equal(study.originals,3);assert.equal((await library.open(study.key)).state.rois[0].id,study.acquisitionKey);}
});

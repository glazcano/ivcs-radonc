import test from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import JSZip from 'jszip';import dp from 'dicom-parser';
import {createDemoRadiotherapyDataset} from '../src/utils/demoData';import {exportSpatialRegistration,rigidDicomMatrix,REG_SOP_CLASS} from '../src/utils/spatialRegistrationExporter';import {identity3d,transformPoint} from '../src/utils/rigid3d';import {checkedOriginals,buildDicomBundle,bundleCatalog} from '../src/utils/dicomBundle';import {createLibrary} from '../server/library.mjs';import {exportMonacoRtStruct} from '../src/utils/monacoRtStructExporter';
const demo=createDemoRadiotherapyDataset(),ref=demo.series,moving=demo.studies[1];
const transform={...identity3d([17,-23,8]),translationX:11,translationY:-7,translationZ:3,rotationX:13,rotationY:-24,rotationDeg:31};
test('REG stores moving-to-reference LPS matrix, pivot, references and cross-study hierarchy',()=>{
 const other={...moving,studyInstanceUID:'2.25.12345',frameOfReferenceUID:'2.25.67890'},reg=exportSpatialRegistration(ref,other,transform),ds=dp.parseDicom(reg.bytes);
 assert.equal(ds.string('x00080016'),REG_SOP_CLASS);assert.equal(ds.string('x00020002'),REG_SOP_CLASS);assert.equal(ds.string('x00200052'),ref.frameOfReferenceUID);assert.equal(ds.string('x00080060'),'REG');
 assert.equal(ds.elements.x00081200.items![0].dataSet.string('x0020000d'),other.studyInstanceUID);
 const entries=ds.elements.x00700308.items!;assert.equal(entries.length,2);
 const source=entries[1].dataSet;assert.equal(source.string('x00200052'),other.frameOfReferenceUID);assert.equal(source.elements.x00081140.items!.length,moving.slices.length);
 const matrixItem=source.elements.x00700309.items![0].dataSet.elements.x0070030a.items![0].dataSet;
 assert.equal(matrixItem.string('x0070030c'),'RIGID');const encoded=matrixItem.string('x300600c6')!.split('\\');assert.ok(encoded.every(v=>v.length<=16));const m=encoded.map(Number);
 for(const p of [[0,0,0],[100,-30,42],transform.center] as [number,number,number][]){const expected=transformPoint(p,transform);for(let i=0;i<3;i++)assert.ok(Math.abs(m[i*4+3]+p.reduce((s,v,j)=>s+m[i*4+j]*v,0)-expected[i])<1e-7);}
 assert.throws(()=>rigidDicomMatrix({...transform,scaleX:2}));assert.throws(()=>rigidDicomMatrix({...transform,translationX:NaN}));assert.throws(()=>exportSpatialRegistration(ref,{...other,patientId:'other'},transform));
 // Shared FoR is still explicitly scoped to each referenced image set.
 const shared=dp.parseDicom(exportSpatialRegistration(ref,moving,transform).bytes);assert.equal(shared.elements.x00700308.items!.length,2);
});
test('ZIP preserves original bytes, completeness, RT references and selected registrations',async()=>{
 const library=createLibrary('build/release-common/data'),index=await library.list(),patient=index.patients[0],ct=patient.studies.find(s=>s.modality==='CT')!,mr=patient.studies.find(s=>s.modality==='MR')!;
 const ctZip=await library.exportOriginals(ct.key),mrZip=await library.exportOriginals(mr.key),ctFiles=await checkedOriginals(ref,ctZip);
 assert.equal(ctFiles.length,ref.slices.length);const incomplete=await JSZip.loadAsync(ctZip);incomplete.remove(Object.keys(incomplete.files).find(k=>!incomplete.files[k].dir)!);await assert.rejects(checkedOriginals(ref,await incomplete.generateAsync({type:'uint8array'})),/Faltan imágenes/);
 await assert.rejects(checkedOriginals({...ref,patientId:'wrong'},ctZip),/no coinciden/);
 const originalFetch=globalThis.fetch;globalThis.fetch=async(input:any)=>{const url=String(input);if(url==='/api/library/')return new Response(JSON.stringify(index));if(url.endsWith('/originals/'+ct.key))return new Response(ctZip);if(url.endsWith('/originals/'+mr.key))return new Response(mrZip);if(url.endsWith('/export/'+mr.key))return new Response(JSON.stringify({selected:moving}));throw new Error('Unexpected request '+url);};
 try{
  const catalog=await bundleCatalog(ref,demo.studies,{...demo.registrationState,transforms:{...demo.registrationState.transforms,[moving.id]:transform}});assert.equal(catalog.reference.key,ct.key);assert.deepEqual(catalog.choices.find(c=>c.entry.key===mr.key)?.transform,transform);
  const rt=exportMonacoRtStruct(ref,demo.initialRois).blob;
  const basic=await JSZip.loadAsync(await (await buildDicomBundle(ref,rt,catalog,[],()=>{})).arrayBuffer());assert.equal(Object.keys(basic.files).filter(n=>n.endsWith('.dcm')).length,ref.slices.length+1);assert.ok(!Object.keys(basic.files).some(n=>n.includes('REG_')));
  for(let i=0;i<ctFiles.length;i++)assert.deepEqual(await basic.file(`DICOM/IMG_001_${String(i+1).padStart(5,'0')}.dcm`)!.async('uint8array'),ctFiles[i]);
  const advanced=await JSZip.loadAsync(await (await buildDicomBundle(ref,rt,catalog,[mr.key],()=>{})).arrayBuffer());assert.equal(Object.keys(advanced.files).filter(n=>n.endsWith('.dcm')).length,ref.slices.length+moving.slices.length+2);
  const manifest=JSON.parse(await advanced.file('manifest.json')!.async('string'));assert.deepEqual(manifest.registrations[0].matrix,rigidDicomMatrix(transform));
  const sopSet=new Set<string>();for(const name of Object.keys(advanced.files).filter(n=>n.endsWith('.dcm'))){const ds=dp.parseDicom(await advanced.file(name)!.async('uint8array'));sopSet.add(ds.string('x00080018')!);}
  const checkRefs=(ds:any)=>{if(ds.elements.x00081155){if(ds.string('x00081150')==='1.2.840.10008.3.1.2.3.1')assert.equal(ds.string('x00081155'),ref.studyInstanceUID);else assert.ok(sopSet.has(ds.string('x00081155')))};for(const e of Object.values(ds.elements) as any[])for(const i of e.items || [])if(i.dataSet)checkRefs(i.dataSet);};
  checkRefs(dp.parseDicom(await advanced.file('DICOM/RTSTRUCT.dcm')!.async('uint8array')));checkRefs(dp.parseDicom(await advanced.file('DICOM/REG_001.dcm')!.async('uint8array')));
  const chunks:Uint8Array[]=[];let writing=false;
  const empty=await buildDicomBundle(ref,rt,catalog,[],()=>{},undefined,{write:async chunk=>{assert.equal(writing,false);writing=true;await new Promise(r=>setTimeout(r,0));chunks.push(chunk);writing=false;}});
  assert.equal(empty.size,0);const streamed=await JSZip.loadAsync(await new Blob(chunks as BlobPart[]).arrayBuffer());assert.deepEqual(await streamed.file('DICOM/IMG_001_00001.dcm')!.async('uint8array'),ctFiles[0]);
  await assert.rejects(buildDicomBundle(ref,rt,catalog,[],()=>{},undefined,{write:async()=>{throw new Error('disk full');}}),/disk full/);
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(buildDicomBundle(ref,rt,catalog,[],()=>{},cancelled.signal),/cancelada/);
 }finally{globalThis.fetch=originalFetch;}
});

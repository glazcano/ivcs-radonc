import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createLibrary,libraryRouter} from '../server/library.mjs';
import {filterPatients,encodeLibrary,decodeLibrary} from '../src/utils/libraryClient';

const study=(patientId:string,id:string)=>({patientId,patientName:'Pérez^Ana María',id,seriesInstanceUID:id,modality:'CT',seriesDescription:'Pelvis',slices:[{id:'slice',sopInstanceUID:'1.2.3',rows:2,cols:2,imagePositionPatient:[0,0,0],huData:[0,1,2,3]}]});
test('incremental saves reuse mask bytes and reject a stale window before writing',()=>withLibrary(async(library,root)=>{
  const {key}=await library.putStudy(study('001','1.1'));
  const first=await library.save({key,studyKeys:[key],expectedRevision:null,state:{rois:[{id:'roi',name:'PTV',sliceMasks:{0:[1,0,0,0]}}]}});
  const index=await library.list(),dir=path.join(root,'s',key.slice(0,24),'masks'),files=await fs.readdir(dir),mtime=(await fs.stat(path.join(dir,files[0]))).mtimeMs;
  const second=await library.save({key,studyKeys:[key],expectedRevision:first.revision,state:{rois:[{id:'roi',name:'Renamed',sliceMasks:{0:{unchanged:true}}}]}});
  assert.equal((await fs.readdir(dir)).length,1);assert.equal((await fs.stat(path.join(dir,files[0]))).mtimeMs,mtime);
  await assert.rejects(()=>library.save({key,studyKeys:[key],expectedRevision:first.revision,state:{rois:[]}}),/Otra ventana/);
  assert.equal((await library.open(key)).revision,second.revision);assert.deepEqual((await library.open(key)).state.rois[0].sliceMasks[0],[1,0,0,0]);
}));
test('deletion is recoverable, prevents stale saves and cleans registration references',()=>withLibrary(async library=> {
  const a=await library.putStudy(study('001','1.1')),b=await library.putStudy(study('001','1.2'));
  await library.group({referenceKey:a.key,secondaryKey:b.key,transform:{translationX:0,translationY:0,translationZ:0,rotationDeg:0,scaleX:1,scaleY:1}});
  await library.save({key:a.key,studyKeys:[a.key,b.key],state:{rois:[{id:'kept'}],registrationState:{active:true,secondaryStudyId:'1.2',transforms:{'1.2':{}}}}});
  await library.remove({kind:'study',key:b.key});
  assert.equal((await library.open(a.key)).state.registrationState.active,false);
  assert.equal((await library.list()).patients[0].groups.length,0);
  await assert.rejects(()=>library.open(b.key),/no encontrado/);
  await assert.rejects(()=>library.putStudy(study('001','1.2')),/papelera/);
  await assert.rejects(()=>library.save({key:a.key,studyKeys:[a.key,b.key],state:{rois:[]}}));
  await library.restore((await library.list()).trash[0].id);
  assert.equal((await library.list()).patients[0].groups.length,1);
  const index=await library.list();await library.remove({kind:'patient',key:index.patients[0].key});
  assert.equal((await library.list()).patients.length,0);assert.equal((await library.list()).latest,null);assert.equal((await library.list()).exists,true);
  await assert.rejects(()=>library.save({key:a.key,studyKeys:[a.key],state:{rois:[]}}),/no encontrado/);
  await library.restore((await library.list()).trash[0].id);
  assert.equal((await library.open(a.key)).state.rois[0].id,'kept');
  assert.equal((await library.open(a.key,true)).studies.length,1);
}));
async function withLibrary(fn:(library:ReturnType<typeof createLibrary>,root:string)=>Promise<void>) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'radcontour-library-'));
  try {await fn(createLibrary(root),root);} finally {await fs.rm(root,{recursive:true,force:true});}
}
test('keeps separate patients and preserves contours on repeated DICOM imports',()=>withLibrary(async library=> {
  const a=await library.putStudy(study('001','1.1')), b=await library.putStudy(study('002','1.1'));
  assert.notEqual(a.key,b.key);
  await library.save({key:a.key,studyKeys:[a.key],state:{rois:[{id:'a',sliceMasks:{0:[1,0,0,0]}}]}});
  await library.putStudy(study('001','1.1'));
  assert.equal((await library.open(a.key)).state.rois[0].id,'a');
  assert.equal((await library.open(b.key)).state,null);
  assert.equal((await library.list()).patients.length,2);
  await assert.rejects(()=>library.save({key:a.key,studyKeys:[a.key,b.key],state:{rois:[]}}),/mismo paciente/);
}));
test('library stays readable after moving the whole data folder; only last two revisions retained',()=>withLibrary(async(library,root)=> {
  const a=await library.putStudy(study('../Paciente:01','1.1'));
  for(let i=0;i<4;i++)await library.save({key:a.key,studyKeys:[a.key],state:{rois:[{id:String(i)}]}});
  const index=await library.list(),dir=path.join(root,'s',a.key.slice(0,24));
  assert.equal((await fs.readdir(dir)).filter(n=>n.startsWith('state-')).length,2);
  const moved=path.join(root,'moved');await fs.mkdir(moved);
  await fs.cp(path.join(root,'s'),path.join(moved,'s'),{recursive:true});await fs.copyFile(path.join(root,'index.json'),path.join(moved,'index.json'));
  assert.equal((await createLibrary(moved).open(a.key)).state.rois[0].id,'3');
}));
test('saved registration groups share a color, keep transforms and reject cross-patient membership',()=>withLibrary(async library=> {
  const a=await library.putStudy(study('001','1.1')),b=await library.putStudy(study('001','1.2')),c=await library.putStudy(study('002','1.3'));
  const transform={translationX:4,translationY:0,translationZ:2,rotationDeg:1,scaleX:1,scaleY:1};
  const group=await library.group({referenceKey:a.key,secondaryKey:b.key,transform});
  assert.deepEqual(group.members,[a.key,b.key]);assert.equal(group.transforms[b.key].translationX,4);
  await assert.rejects(()=>library.group({referenceKey:a.key,secondaryKey:c.key,transform}),/mismo paciente/);
}));
test('flexible filter combines ID, accent-insensitive names and modality',()=> {
  const patients=[{id:'00123',name:'Pérez^Ana María',studies:[{modality:'CT',description:'Pelvis',studyDescription:'Simulación',date:'20260908'}]}] as any;
  assert.equal(filterPatients(patients,'123 ana perez CT').length,1);
  assert.equal(filterPatients(patients,'ana MR').length,0);
  assert.equal(filterPatients(patients,'202609').length,1);
});
test('binary arrays survive compact storage encoding',()=> {
  const value={image:new Int16Array([-1024,0,32767]),mask:new Uint8Array([0,1,0])};
  assert.deepEqual(decodeLibrary(encodeLibrary(value)),value);
});
test('archives exact original DICOM bytes inside the patient folder',()=>withLibrary(async(library,root)=> {
  const added=await library.putStudy(study('001','1.1'));
  const parts=[Buffer.alloc(128),Buffer.from('DICM')];
  const element=(group:number,tag:number,vr:string,value:string)=> {
    const data=Buffer.from(value+(value.length%2?(vr==='UI'?'\0':' '):'')),header=Buffer.alloc(8);
    header.writeUInt16LE(group,0);header.writeUInt16LE(tag,2);header.write(vr,4);header.writeUInt16LE(data.length,6);parts.push(header,data);
  };
  element(2,16,'UI','1.2.840.10008.1.2.1');element(16,32,'LO','001');element(32,14,'UI','1.1');
  const bytes=Buffer.concat(parts);
  await library.originals('001',bytes,'../original.dcm');
  await library.originals('001',bytes,'duplicate.dcm');
  const index=await library.list(),patient=index.patients[0],dir=path.join(root,'s',added.key.slice(0,24),'dicom');
  const files=await fs.readdir(dir);assert.equal(files.length,1);assert.equal(patient.studies[0].originals,1);
  assert.deepEqual(await fs.readFile(path.join(dir,files[0])),bytes);
}));
test('local API rejects foreign origins and writes without explicit application header',()=>withLibrary(async(_library,root)=> {
  const server=libraryRouter(root).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.on('listening',resolve));
  try {
    const address=server.address() as any,url=`http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(url)).status,200);
    assert.equal((await fetch(url,{headers:{Origin:'https://other.example'}})).status,403);
    assert.equal((await fetch(url+'/study',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
    const added=await fetch(url+'/study',{method:'POST',headers:{'Content-Type':'application/json','X-RadContour':'local'},body:JSON.stringify(study('001','1.1'))});
    assert.equal(added.status,200);
  } finally {server.close();}
}));

test('legacy paths migrate atomically without changing IDs, masks or trash recovery',()=>withLibrary(async(library,root)=>{
 const {key}=await library.putStudy(study('long-patient-'.repeat(30),'1.2.3'));
 await library.save({key,studyKeys:[key],state:{rois:[{id:'r',sliceMasks:{0:[0,1,1,0]}}]}});
 const index=await library.list(),old=path.join(root,'patients',index.patients[0].key,'studies',key),short=path.join(root,'s',key.slice(0,24));
 await library.remove({kind:'patient',key:index.patients[0].key});
 await fs.mkdir(path.dirname(old),{recursive:true});await fs.rename(short,old);
 const migrated=createLibrary(root),trash=(await migrated.list()).trash[0];
 await fs.access(short);await assert.rejects(()=>fs.access(old));
 await migrated.restore(trash.id);
 assert.deepEqual((await migrated.open(key)).state.rois[0].sliceMasks[0],[0,1,1,0]);
 assert.equal((await migrated.list()).patients[0].studies[0].key,key);
 assert.ok(short.length<old.length-100);
 // A new process can reopen the already migrated library.
 assert.equal((await createLibrary(root).open(key)).selected.slices[0].huData[3],3);
}));

test('linked registration group updates commit atomically and preserve detach choices',()=>withLibrary(async library=>{
 const a=await library.putStudy(study('001','1.1')),b=await library.putStudy(study('001','1.2')),c=await library.putStudy(study('001','1.3'));
 const t={model:'rigid3d',center:[0,0,0],translationX:5,translationY:0,translationZ:0,rotationX:0,rotationY:0,rotationDeg:0,scaleX:1,scaleY:1,locked:false};
 await library.group({referenceKey:a.key,entries:[{secondaryKey:b.key,transform:t},{secondaryKey:c.key,transform:t}],detachedSeriesIds:['1.2']});
 const before=(await library.list()).patients[0].groups[0];assert.equal(before.members.length,3);assert.deepEqual(before.detachedSeriesIds,['1.2']);
 await assert.rejects(()=>library.group({referenceKey:a.key,entries:[{secondaryKey:b.key,transform:{...t,translationX:99}},{secondaryKey:'missing',transform:t}]}));
 assert.deepEqual((await library.list()).patients[0].groups[0],before);
}));

test('high resolution library masks retain scale and compressed bytes across metadata-only saves',()=>withLibrary(async(library,root)=>{
 const image=study('SYNTHETIC-2X','2.25.200'),{key}=await library.putStudy(image),mask=new Uint8Array(16);mask[5]=1;
 const roi={id:'hr',name:'HR',maskScale:2,sliceMasks:{0:mask}};
 const encoded=JSON.parse(encodeLibrary({rois:[roi]})),first=await library.save({key,studyKeys:[key],expectedRevision:null,state:encoded});
 const dir=path.join(root,'s',key.slice(0,24),'masks'),files=await fs.readdir(dir),before=await fs.readFile(path.join(dir,files[0]));
 await library.save({key,studyKeys:[key],expectedRevision:first.revision,state:{rois:[{...roi,name:'Renamed HR',sliceMasks:{0:{unchanged:true}}}]}});
 const restored=decodeLibrary(JSON.stringify((await library.open(key)).state));assert.equal(restored.rois[0].maskScale,2);assert.deepEqual(restored.rois[0].sliceMasks[0],mask);assert.deepEqual(await fs.readFile(path.join(dir,files[0])),before);assert.equal((await fs.readdir(dir)).length,1);
}));

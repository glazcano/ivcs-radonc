import JSZip from 'jszip';
import {frameDataset} from './dicomFrames.mjs';
import {derivedDicomImages} from './derivedDicom';
import type {DicomSeries,ImageStudy,RegistrationState,RegistrationTransform} from '../types';
import {libraryIndex,readExportStudy,LibraryStudy} from './libraryClient';
import {readDicomDataset} from './dicomDataset.mjs';
import {dicomText} from './dicomText';
import {identity3d} from './rigid3d';
import {exportSpatialRegistration,rigidDicomMatrix,validateDicomIdentity} from './spatialRegistrationExporter';
export interface BundleChoice {entry:LibraryStudy;transform?:RegistrationTransform;reason?:string;source?:string;}
export interface BundleCatalog {reference:LibraryStudy;choices:BundleChoice[];}
export async function bundleCatalog(series:DicomSeries,studies:ImageStudy[],registration:RegistrationState):Promise<BundleCatalog>{
 const index=await libraryIndex(),patient=index.patients.find(p=>p.id===series.patientId);
 const matches=(s:ImageStudy)=>s.seriesInstanceUID===series.seriesInstanceUID && s.acquisitionKey===series.acquisitionKey && s.slices[0]?.sopInstanceUID===series.slices[0]?.sopInstanceUID;
 const ref=studies.find(matches),entry=patient?.studies.find(e=>e.id===ref?.id);
 if(!patient || !entry)throw new Error('La imagen principal no está disponible en la biblioteca local.');
 if(!entry.originals)throw new Error('No tiene DICOM originales archivados.');
 const group=patient.groups.find(g=>g.referenceKey===entry.key);
 const choices=patient.studies.filter(e=>e.key!==entry.key).map(e=>{
  const current=registration.referenceStudyId===ref?.id?registration.transforms[e.id]:undefined;
  const loaded=studies.find(s=>s.id===e.id);
  let transform=current || group?.transforms[e.key],source=current?'Corregistro actual':'Corregistro guardado';
  if(!transform && loaded?.frameOfReferenceUID && loaded.frameOfReferenceUID===series.frameOfReferenceUID){transform=identity3d();source='Mismo marco DICOM';}
  let reason=!e.originals?'No tiene DICOM originales archivados.':!transform?'Sin corregistro con la imagen principal.':undefined;
  if(transform)try{rigidDicomMatrix(transform);}catch{reason='Corregistro rígido 3D inválido.';}
  return {entry:e,transform,reason,source};
 });
 return {reference:entry,choices};
}
function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw new Error('Operación cancelada.');}
/** Validates the actual archived files, not just the library's file counter.
 * Only referenced SOP instances are included; pixels and original headers are untouched. */
export async function checkedOriginals(series:DicomSeries,archive:ArrayBuffer|Uint8Array,signal?:AbortSignal){
 validateDicomIdentity(series);const zip=await JSZip.loadAsync(archive),wanted=new Map(series.slices.map(s=>[s.sopInstanceUID,s])),found=new Map<string,Uint8Array>();
 for(const entry of Object.values(zip.files)){
  checkAbort(signal);if(entry.dir)continue;const bytes=await entry.async('uint8array'),ds=readDicomDataset(bytes,{untilTag:'x7fe00010'}),uid=ds.string('x00080018');
  if(!wanted.has(uid))continue;
  const slice=wanted.get(uid)!;
  if(dicomText(ds,'x00100020')!==series.patientId || ds.string('x0020000d')!==series.studyInstanceUID || ds.string('x0020000e')!==series.seriesInstanceUID || ds.string('x00200052')!==series.frameOfReferenceUID || ds.string('x00080016')!==slice.sopClassUID || ds.uint16('x00280010')!==slice.rows || ds.uint16('x00280011')!==slice.cols || (!ds.elements.x7fe00010 && !ds.elements.x7fe00008))throw new Error('Los originales no coinciden con la serie de referencia.');
  for(const expectedSlice of series.slices.filter(s=>s.sopInstanceUID===uid)){const frame=expectedSlice.frameNumber?frameDataset(ds,expectedSlice.frameNumber-1):ds;
  for(const [tag,expected] of [['x00200032',expectedSlice.imagePositionPatient],['x00200037',expectedSlice.imageOrientationPatient],['x00280030',expectedSlice.pixelSpacing]] as const){const values=frame.string(tag)?.split('\\').map(Number);if(!expected || !values || values.length!==expected.length || values.some((v,i)=>!Number.isFinite(v) || Math.abs(v-expected[i])>1e-4))throw new Error('La geometría original no coincide con la serie abierta.');}
  }
  const prior=found.get(uid);if(prior && (prior.length!==bytes.length || prior.some((v,i)=>v!==bytes[i])))throw new Error('Hay originales distintos con el mismo identificador DICOM.');found.set(uid,bytes);
 }
 if(found.size!==wanted.size)throw new Error('Faltan imágenes DICOM originales. No se generó un ZIP incompleto.');
 return [...wanted.keys()].map(uid=>found.get(uid!)!);
}
export async function buildDicomBundle(series:DicomSeries,rtstruct:Blob,catalog:BundleCatalog,selectedKeys:string[],progress:(message:string)=>void,signal?:AbortSignal,sink?:{write:(chunk:Uint8Array)=>Promise<void>}){
 let retainedBytes=0;
 const chosen=selectedKeys.map(key=>{const c=catalog.choices.find(c=>c.entry.key===key);if(!c || c.reason || !c.transform)throw new Error(c?.reason || 'Corregistro rígido 3D inválido.');return c;});
 if(new Set(selectedKeys).size!==selectedKeys.length)throw new Error('Hay series duplicadas.');
 const zip=new JSZip(),report:any={format:'IVCS RT DICOM bundle',referenceSeriesUID:series.seriesInstanceUID,images:[],registrations:[],notes:'Original image bytes unchanged. Reconstructed primary series include derived axial DICOM plus their originals. REG matrices map moving patient LPS to reference patient LPS. Import REG support is required in the destination TPS.'};
 const add=async(s:DicomSeries,key:string,n:number)=>{
  checkAbort(signal);progress('Verificando y empaquetando DICOM originales…');
  if(s.patientId!==series.patientId)throw new Error('Las series pertenecen a pacientes distintos.');
  const response=await fetch('/api/library/originals/'+encodeURIComponent(key),{signal});if(!response.ok)throw new Error('No se pudieron recuperar los originales. Repita la comprobación.');
  const originalBytes=await checkedOriginals(s.sourceVolume || s,await response.arrayBuffer(),signal);
  const bytes=s.sourceVolume?await derivedDicomImages(s,originalBytes):originalBytes;
  retainedBytes+=bytes.reduce((n,b)=>n+b.byteLength,0)+(s.sourceVolume?originalBytes.reduce((n,b)=>n+b.byteLength,0):0);
  if(retainedBytes>(sink?1536:256)*1024*1024)throw new Error('El ZIP supera el límite de memoria de este modo de exportación. Exporte menos series.');
  if(s.sourceVolume)for(let i=0;i<originalBytes.length;i++)zip.file(`DICOM/SOURCE_${String(n).padStart(3,'0')}_${String(i+1).padStart(5,'0')}.dcm`,originalBytes[i]);
  for(let i=0;i<bytes.length;i++)zip.file(`DICOM/IMG_${String(n).padStart(3,'0')}_${String(i+1).padStart(5,'0')}.dcm`,bytes[i]);
  report.images.push({resampling:s.resampling,originalImagesIncluded:s.sourceVolume?originalBytes.length:undefined,seriesInstanceUID:s.seriesInstanceUID,studyInstanceUID:s.studyInstanceUID,frameOfReferenceUID:s.frameOfReferenceUID,description:s.seriesDescription,count:bytes.length,sourceCompressed:s.slices.some(v=>v.sourceCompressed),sourceLossy:s.slices.some(v=>v.sourceLossy),sourceRaw:s.slices.some(v=>v.sourceRaw)});
 };
 await add(series,catalog.reference.key,1);zip.file('DICOM/RTSTRUCT.dcm',await rtstruct.arrayBuffer());
 for(let i=0;i<chosen.length;i++){
  checkAbort(signal);const c=chosen[i],{selected:loaded}=await readExportStudy(c.entry.key);checkAbort(signal);const moving=loaded.sourceVolume || loaded;
  const reg=exportSpatialRegistration(series,moving,c.transform!);await add(moving,c.entry.key,i+2);
  const name=`DICOM/REG_${String(i+1).padStart(3,'0')}.dcm`;zip.file(name,reg.bytes);report.registrations.push({file:name,sopInstanceUID:reg.sopInstanceUID,movingSeriesUID:moving.seriesInstanceUID,matrix:reg.matrix,source:c.source});
 }
 zip.file('manifest.json',JSON.stringify(report,null,2));zip.file('README.txt','IVCS RT — DICOM export\n\nExtract the ZIP, then import all files in DICOM into the TPS. RTSTRUCT belongs to the primary series. For reconstructed primary images, the derived axial DICOM and the source originals are both included; import the derived series with its RTSTRUCT. Additional series retain their original pixels and geometry; REG objects encode their rigid alignment. The TPS must support DICOM Spatial Registration and apply the supplied REG. Verify the alignment after import; importing only the images does not apply a manual registration. No plans or dose are included. Compressed/lossy images are not validated for dose calculation. Raw datasets without Part 10 headers remain unchanged and may require destination support.\n');
 checkAbort(signal);progress('Generando ZIP…');
 if(sink){await new Promise<void>((resolve,reject)=>{
  const stream=zip.generateInternalStream({type:'uint8array',compression:'STORE',streamFiles:true});
  let writes=Promise.resolve(),queued=0,failed=false,ended=false;
  const abort=()=>{failed=true;stream.pause();reject(new Error('Operación cancelada.'));};signal?.addEventListener('abort',abort,{once:true});
  const clean=()=>signal?.removeEventListener('abort',abort);
  stream.on('data',chunk=>{stream.pause();queued+=chunk.byteLength;
   if(queued>8*1024*1024){failed=true;clean();reject(new Error('ZIP output queue exceeds memory limit.'));return;}
   // JSZip can emit several descriptor/directory chunks while flushing, even
   // after pause. Serialize writes and wait for the queue before resuming.
   writes=writes.then(async()=>{if(!failed)await sink.write(chunk);queued-=chunk.byteLength;if(!queued&&!ended&&!failed&&!signal?.aborted)stream.resume();}).catch(e=>{failed=true;clean();reject(e);});
  });
  stream.on('error',e=>{failed=true;clean();reject(e);});stream.on('end',()=>{ended=true;void writes.then(()=>{clean();if(!failed)resolve();});});stream.resume();
 });return new Blob([]);}
 const blob=await zip.generateAsync({type:'blob',compression:'STORE',streamFiles:true},()=>checkAbort(signal));checkAbort(signal);return blob;
}

/** Synthetic interoperability fixture with an analytically known rigid CT/MR alignment. */
import {promises as fs} from 'node:fs';import JSZip from 'jszip';import codecs from 'dcmjs-codecs';
import {createDemoRadiotherapyDataset} from '../src/utils/demoData';
import {identity3d,transformPoint,rotationMatrix,Vec3} from '../src/utils/rigid3d';
import {inverse} from '../src/utils/registrationGeometry';
import {exportSpatialRegistration} from '../src/utils/spatialRegistrationExporter';
import {importSpatialRegistration} from '../src/utils/spatialRegistrationImporter';
import {parseDicomByteArray} from '../src/utils/dicomParser';
const demo=createDemoRadiotherapyDataset(),source=await JSZip.loadAsync(await fs.readFile('build/release-common/demo/Luciano_Bello_SYNTHETIC_DICOM.zip'));
const uid=()=> '2.25.'+BigInt('0x'+crypto.randomUUID().replaceAll('-',''));
const transform={...identity3d(),translationX:12,translationY:-7,translationZ:5,rotationDeg:7},back=inverse(transform),r=rotationMatrix(back);
const moving={...demo.studies[1],seriesInstanceUID:uid(),frameOfReferenceUID:uid(),slices:demo.studies[1].slices.map(s=>({...s,id:uid(),sopInstanceUID:uid(),imagePositionPatient:transformPoint(s.imagePositionPatient!,back),imageOrientationPatient:[r[0],r[3],r[6],r[1],r[4],r[7]] as [number,number,number,number,number,number]}))};
const zip=new JSZip();let index=0;
for(const entry of Object.values(source.files)){
 if(entry.dir || !entry.name.endsWith('.dcm'))continue;
 const bytes=await entry.async('uint8array');
 if(!entry.name.startsWith('MR/')){zip.file(entry.name,bytes);continue;}
 const s=moving.slices[index++],elements:any=new codecs.Transcoder(bytes.slice().buffer).getElements();
 Object.assign(elements,{SOPInstanceUID:s.sopInstanceUID,SeriesInstanceUID:moving.seriesInstanceUID,FrameOfReferenceUID:moving.frameOfReferenceUID,ImagePositionPatient:s.imagePositionPatient.map(v=>Number(v.toPrecision(12))),ImageOrientationPatient:s.imageOrientationPatient.map(v=>Number(v.toPrecision(12))),SeriesDescription:'SYNTHETIC MR known rigid offset'});
 const output=new Uint8Array(new codecs.Transcoder(elements,'1.2.840.10008.1.2.1').getDicomPart10()),parsed=parseDicomByteArray(output);
 if(parsed.slice.huData.some((v,i)=>v!==s.huData[i]))throw new Error('QA pixels changed');
 if(parsed.slice.imagePositionPatient!.some((v,i)=>Math.abs(v-s.imagePositionPatient[i])>1e-8) || parsed.slice.imageOrientationPatient!.some((v,i)=>Math.abs(v-s.imageOrientationPatient[i])>1e-10))throw new Error('QA geometry changed beyond encoding tolerance');
 zip.file(entry.name,output);
}
if(index!==moving.slices.length)throw new Error('Missing synthetic MR frames');
const reg=exportSpatialRegistration(demo.series,moving,transform),roundtrip=importSpatialRegistration(reg.bytes,demo.series,moving);
const points=([[0,0,0],[20,-30,40],[-50,30,-20]] as Vec3[]).map(reference=>({reference,moving:transformPoint(reference,back)}));
if(points.some(p=>Math.hypot(...transformPoint(p.moving,roundtrip.transform).map((v,i)=>v-p.reference[i]))>1e-6))throw new Error('REG direction check failed');
zip.file('REG.dcm',reg.bytes);zip.file('expected.json',JSON.stringify({synthetic:true,externalTpsTest:'PENDING',referenceSeriesUID:demo.series.seriesInstanceUID,movingSeriesUID:moving.seriesInstanceUID,movingToReferenceMatrix:reg.matrix,landmarksLpsMm:points},null,2));
zip.file('README.txt','Synthetic CT and MR with distinct frames of reference. MR pixels are unchanged; MR acquisition geometry is transformed by the inverse of the supplied rigid REG. After applying REG the volumes must recover the original synthetic alignment. Check expected.json landmarks in all planes. No clinical data; external TPS acceptance remains pending.');
await fs.mkdir('validation',{recursive:true});await fs.writeFile('validation/TPS-rigid-registration-QA.zip',await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));console.log('PASS synthetic offset MR pixels and REG direction; external TPS QA archive generated.');

import type {DicomSeries,RegistrationTransform} from '../types';
import {DicomBinaryBuffer as B} from './monacoRtStructExporter';
import {identity3d,rotationMatrix} from './rigid3d';
import {REVISION_CODE} from '../appInfo';
export const REG_SOP_CLASS='1.2.840.10008.5.1.4.1.1.66.1';
const uid=()=> '2.25.'+BigInt('0x'+crypto.randomUUID().replace(/-/g,'')).toString();
const item=(write:(b:B)=>void)=>{const b=new B(1024);write(b);return b.getBytes();};
export function rigidDicomMatrix(t:RegistrationTransform):number[]{
 if(t.model!=='rigid3d' || t.scaleX!==1 || t.scaleY!==1 || !t.center || t.center.length!==3 || ![...t.center,t.translationX,t.translationY,t.translationZ,t.rotationX,t.rotationY,t.rotationDeg].every(Number.isFinite))throw new Error('Corregistro rígido 3D inválido.');
 const r=rotationMatrix(t),c=t.center,d=[t.translationX,t.translationY,t.translationZ];
 // Moving patient LPS -> reference patient LPS, including the rotation pivot.
 const matrix=[0,1,2].flatMap(i=>[...r.slice(3*i,3*i+3),c[i]+d[i]-r.slice(3*i,3*i+3).reduce((s,v,j)=>s+v*c[j],0)]).concat([0,0,0,1]);
 if(!matrix.every(Number.isFinite))throw new Error('Corregistro rígido 3D inválido.');return matrix;
}
export function validateDicomIdentity(s:DicomSeries){
 const valid=(u?:string)=>!!u && u.length<=64 && /^(0|[1-9]\d*)(\.(0|[1-9]\d*))+$/u.test(u);
 if(!s.patientId || ![s.studyInstanceUID,s.seriesInstanceUID,s.frameOfReferenceUID,...s.slices.flatMap(v=>[v.sopInstanceUID,v.sopClassUID])].every(valid) || !s.slices.length || new Set(s.slices.map(v=>v.sopInstanceUID+':'+(v.frameNumber || ''))).size!==s.slices.length)throw new Error('Faltan identificadores DICOM válidos o hay imágenes duplicadas.');
}
export function exportSpatialRegistration(reference:DicomSeries,moving:DicomSeries,t:RegistrationTransform){
 validateDicomIdentity(reference);validateDicomIdentity(moving);if(reference.patientId!==moving.patientId)throw new Error('Las series pertenecen a pacientes distintos.');
 const matrix=rigidDicomMatrix(t),sop=uid(),seriesUID=uid(),now=new Date(),date=now.toISOString().slice(0,10).replace(/-/g,''),time=now.toISOString().slice(11,19).replace(/:/g,'');
 const refs=(s:DicomSeries)=>s.slices.map(v=>item(b=>{b.writeStringElement(8,0x1150,'UI',v.sopClassUID!);b.writeStringElement(8,0x1155,'UI',v.sopInstanceUID!);if(v.frameNumber)b.writeStringElement(8,0x1160,'IS',String(v.frameNumber));}));
 const seriesRefs=(s:DicomSeries)=>item(b=>{b.writeSequence(8,0x114a,refs(s));b.writeStringElement(0x20,0xe,'UI',s.seriesInstanceUID!);});
 const registration=(s:DicomSeries,m:number[])=>item(b=>{
  b.writeSequence(8,0x1140,refs(s));b.writeStringElement(0x20,0x52,'UI',s.frameOfReferenceUID!);
  b.writeSequence(0x70,0x309,[item(b=>{
   b.writeSequence(0x70,0x30a,[item(b=>{b.writeStringElement(0x70,0x30c,'CS','RIGID');b.writeStringElement(0x3006,0xc6,'DS',m.map(v=>{const text=Number(v.toPrecision(12)).toString();return text.length<=16?text:v.toExponential(8);}).join('\\'));})]);
   b.writeSequence(0x70,0x30d,[]);
  })]);
 });
 const b=new B(),str=(g:number,e:number,vr:string,v:string)=>b.writeStringElement(g,e,vr,v);
 str(8,5,'CS','ISO_IR 192');str(8,0x16,'UI',REG_SOP_CLASS);str(8,0x18,'UI',sop);str(8,0x20,'DA',reference.studyDate || '');str(8,0x23,'DA',date);str(8,0x30,'TM',reference.studyTime || '');str(8,0x33,'TM',time);str(8,0x50,'SH',reference.accessionNumber || '');str(8,0x60,'CS','REG');str(8,0x70,'LO','IVCS RT');str(8,0x90,'PN','');str(8,0x103e,'LO','IVCS RT rigid registration');
 const sameStudy=reference.studyInstanceUID===moving.studyInstanceUID;
 b.writeSequence(8,0x1115,[seriesRefs(reference),...(sameStudy?[seriesRefs(moving)]:[])]);
 if(!sameStudy)b.writeSequence(8,0x1200,[item(b=>{b.writeSequence(8,0x1115,[seriesRefs(moving)]);b.writeStringElement(0x20,0xd,'UI',moving.studyInstanceUID!);})]);
 str(0x10,0x10,'PN',reference.patientName);str(0x10,0x20,'LO',reference.patientId);str(0x10,0x30,'DA',reference.patientBirthDate || '');str(0x10,0x40,'CS',reference.patientSex || '');
 str(0x18,0x1020,'LO',REVISION_CODE);str(0x20,0xd,'UI',reference.studyInstanceUID!);str(0x20,0xe,'UI',seriesUID);str(0x20,0x10,'SH','');str(0x20,0x11,'IS','900');str(0x20,0x13,'IS','1');str(0x20,0x52,'UI',reference.frameOfReferenceUID!);str(0x20,0x1040,'LO','');
 str(0x70,0x80,'CS','IVCS_RIGID');str(0x70,0x81,'LO','Moving images to reference patient coordinates');str(0x70,0x84,'PN','');b.writeSequence(0x70,0x308,[registration(reference,rigidDicomMatrix(identity3d())),registration(moving,matrix)]);
 const meta=new B();meta.writeElement(2,1,'OB',new Uint8Array([0,1]));meta.writeStringElement(2,2,'UI',REG_SOP_CLASS);meta.writeStringElement(2,3,'UI',sop);meta.writeStringElement(2,0x10,'UI','1.2.840.10008.1.2.1');meta.writeStringElement(2,0x12,'UI','2.25.202609090012345678901234567891');meta.writeStringElement(2,0x13,'SH','IVCSRT_'+REVISION_CODE);
 const file=new B();file.writeBytes(new Uint8Array(128));file.writeAsciiString('DICM');const length=new Uint8Array(4);new DataView(length.buffer).setUint32(0,meta.getLength(),true);file.writeElement(2,0,'UL',length);file.writeBytes(meta.getBytes());file.writeBytes(b.getBytes());
 return {bytes:file.getBytes(),sopInstanceUID:sop,matrix};
}

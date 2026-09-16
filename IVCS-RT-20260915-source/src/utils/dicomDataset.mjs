import dicomParser from 'dicom-parser';
export const IMPLICIT_LE='1.2.840.10008.1.2';
export function readDicomDataset(bytes,options={}){
 const part10=bytes.length>=132 && String.fromCharCode(...bytes.subarray(128,132))==='DICM';
 if(!part10){
  if(bytes.length<16 || bytes[0]!==8 || bytes[1]!==0)throw new Error('DICOM sin cabecera: estructura no reconocida.');
  if(/^[A-Z]{2}$/.test(String.fromCharCode(bytes[4],bytes[5])))throw new Error('DICOM sin cabecera: solo se admite Implicit VR Little Endian validado.');
 }
 let ds;try{ds=dicomParser.parseDicom(bytes,part10?options:{...options,TransferSyntaxUID:IMPLICIT_LE});}catch(e){throw new Error(typeof e==='string'?e:e?.message || 'No se pudo leer el dataset DICOM.');}
 if(!part10){
  const uid=t=>/^\d+(\.\d+)+$/.test(ds.string(t) || '');
  if(!['x00080016','x00080018','x0020000d','x0020000e'].every(uid))throw new Error('DICOM sin cabecera: identificadores inválidos.');
  ds.ivcsRaw=true;
 }
 return ds;
}
export const transferSyntax=ds=>ds.ivcsRaw?IMPLICIT_LE:ds.string('x00020010') || '';
export const acquisitionToken=ds=>{
 const number=ds.string('x00200012')?.trim(),time=ds.string('x00080032')?.trim();
 return number?'acq:'+number:time?'time:'+time:'';
};

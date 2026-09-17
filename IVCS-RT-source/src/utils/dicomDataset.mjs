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
 const dimensions=acquisitionDimensions(ds);
 if(dimensions.length)return dimensions.map(([name,value])=>name+':'+value).join('|');
 const number=ds.string('x00200012')?.trim(),time=ds.string('x00080032')?.trim();
 return number?'acq:'+number:time?'time:'+time:'';
};
// These dimensions identify distinct volumes even when coverage does not overlap.
// AcquisitionTime alone is deliberately only a fallback for repeated positions:
// it can change on every slice in a single volume.
export function acquisitionDimensions(ds){
 const result=[];
 for(const [name,tag] of [['phase','x00200100'],['echo','x00180086'],['TE','x00180081']]){
  const value=ds.string(tag)?.trim();if(value)result.push([name,value]);
 }
 const b=ds.elements['x00189087'];if(b){const value=ds.double('x00189087');if(Number.isFinite(value))result.push(['b',String(value)]);}
 const gradient=ds.elements['x00189089'];if(gradient){const values=[0,1,2].map(i=>ds.double('x00189089',i));if(values.every(Number.isFinite))result.push(['direction',values.join(',')]);}
 for(const [name,tag] of [['respiratory','x00189245'],['cardiac','x00189241']])if(ds.elements[tag]){const value=ds.double(tag);if(Number.isFinite(value))result.push([name,String(value)]);}
 const stack=ds.string('x00209056')?.trim();if(stack)result.push(['stack',stack]);
 return result;
}

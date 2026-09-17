import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parseSession} from '../src/utils/session';
import {encodeLibrary} from '../src/utils/libraryClient';
import {createLibrary} from '../server/library.mjs';

const session=parseSession(await readFile(process.argv[2],'utf8'));
const library=createLibrary(path.resolve('data'));
const keys:string[]=[];
for(const study of session.studies) {
  if(study.id===session.registrationState.referenceStudyId)for(const key of ['studyInstanceUID','seriesInstanceUID','frameOfReferenceUID','patientBirthDate','patientSex','studyDate','studyTime','accessionNumber']) {
    if(study[key]===undefined && session.series[key]!==undefined)study[key]=session.series[key];
  }
  keys.push((await library.putStudy(JSON.parse(encodeLibrary(study)))).key);
}
const index=session.studies.findIndex(s=>s.id===session.registrationState.referenceStudyId);
if(index<0)throw new Error('Referencia no encontrada.');
const {series,studies,...state}=session;
await library.save({key:keys[index],studyKeys:keys,state:JSON.parse(encodeLibrary(state))});
console.log(`Sesión incorporada: ${studies.length} series, ${state.rois.length} estructuras.`);

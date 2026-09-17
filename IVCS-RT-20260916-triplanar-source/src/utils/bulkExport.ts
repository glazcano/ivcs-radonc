import JSZip from 'jszip';
import {checkedOriginals} from './dicomBundle';
import {derivedDicomImages} from './derivedDicom';
import {tr} from '../i18n';
import {readExportStudy,libraryIndex,LibraryPatient} from './libraryClient';
import {compute} from './computeClient';
import type {MonacoExportOptions} from './monacoRtStructExporter';
export interface BulkOptions extends MonacoExportOptions{roiNames?:string[];}
export async function prepareBulk(patients:LibraryPatient[],keys:string[],includeOriginals:boolean,options:BulkOptions,progress:(text:string)=>void,signal?:AbortSignal){
  const cases:any[]=[],report:any[]=[];
  for(let i=0;i<keys.length;i++){
    if(signal?.aborted)throw new Error('Operación cancelada.');
    const key=keys[i],patient=patients.find(p=>p.studies.some(s=>s.key===key)),study=patient?.studies.find(s=>s.key===key);if(!patient || !study)continue;
    progress(`Comprobando ${i+1} de ${keys.length} · ${patient.id}`);
    try{
      if(includeOriginals && !study.originals)throw new Error('No tiene DICOM originales archivados.');
      const {selected,state,revision}=await readExportStudy(key);if(!state)throw new Error('No hay contornos guardados.');
      const rois=state.rois.filter(r=>!options.roiNames?.length || options.roiNames.some(n=>n.toLowerCase()===r.name.toLowerCase()));
      const names=rois.map(r=>r.name.trim().toLowerCase());if(new Set(names).size!==names.length)throw new Error('Hay nombres de ROI duplicados.');
      const result=await compute('export',[selected,rois,options],{signal});if(!result.summary.totalContoursCount)throw new Error('No quedan contornos exportables con los filtros elegidos.');
      const directory=`${patient.id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,16)}_${patient.key.slice(0,12)}/${key.slice(0,24)}/`;
      cases.push({key,revision,directory,blob:result.blob});report.push({patientId:patient.id,study:study.description,key,status:'preparado',comparison:result.comparison,sourceCompressed:selected.slices.some(s=>s.sourceCompressed),sourceLossy:selected.slices.some(s=>s.sourceLossy),detail:(selected.slices.some(s=>s.sourceCompressed || s.sourceLossy)?tr('Origen DICOM comprimido: verifique los originales antes del cálculo de dosis en TPS. Exportar contornos no valida la imagen para cálculo.')+' ':'')+`${result.summary.structuresCount} estructuras; ${result.summary.totalContoursCount} contornos`});
    }catch(e){if(signal?.aborted)throw e;report.push({patientId:patient.id,study:study.description,key,status:'omitido',detail:(e as Error).message});}
  }
  return {cases,report,includeOriginals,options};
}
export async function downloadBulk(prepared:Awaited<ReturnType<typeof prepareBulk>>,progress:(text:string)=>void){
  const index=await libraryIndex();
  for(const c of prepared.cases)if(!index.patients.some(p=>p.studies.some(s=>s.key===c.key && s.state===c.revision)))throw new Error('Una serie cambió después de comprobarla. Actualice y repita la comprobación.');
  const zip=new JSZip();
  for(const c of prepared.cases){progress('Empaquetando estudios comprobados…');zip.file(c.directory+'RTSTRUCT.dcm',await c.blob.arrayBuffer());if(prepared.includeOriginals){const response=await fetch('/api/library/originals/'+encodeURIComponent(c.key));if(!response.ok)throw new Error('No se pudieron recuperar los originales. Repita la comprobación.');const {selected}=await readExportStudy(c.key);const originals=await checkedOriginals(selected.sourceVolume || selected,await response.arrayBuffer());for(let i=0;i<originals.length;i++)zip.file(c.directory+'DICOM/SOURCE_'+String(i+1).padStart(5,'0')+'.dcm',originals[i]);if(selected.sourceVolume){const derived=await derivedDicomImages(selected,originals);for(let i=0;i<derived.length;i++)zip.file(c.directory+'DICOM/AXIAL_'+String(i+1).padStart(5,'0')+'.dcm',derived[i]);}}}
  const report=prepared.report.map(r=>({...r,status:r.status==='preparado'?'exportado':r.status}));
  zip.file('informe.json',JSON.stringify({options:prepared.options,studies:report},null,2));
  zip.file('LEEME.txt','RTSTRUCT por serie de referencia para importación DICOM en TPS. No incluye planes, dosis ni objetos de registro espacial. Revise informe.json y valide imágenes, huecos, islas y estructuras pequeñas en su versión del TPS.');
  return {blob:await zip.generateAsync({type:'blob',compression:'STORE'}),report};
}

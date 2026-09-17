import codecs from 'dcmjs-codecs';
const {NativeCodecs,Transcoder}=codecs;
import JSZip from 'jszip';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
await NativeCodecs.initializeAsync();
const zip=await JSZip.loadAsync(readFileSync('build/release-common/demo/Luciano_Bello_SYNTHETIC_DICOM.zip'));
const file=Object.values(zip.files).find(f=>f.name.startsWith('CT/') && f.name.endsWith('.dcm'));
console.log(file?.name);const bytes=await file.async('arraybuffer');
mkdirSync('build/compressed-fixtures',{recursive:true});writeFileSync('build/compressed-fixtures/uncompressed.dcm',Buffer.from(bytes));
for(const suffix of ['5','4.70','4.80','4.90','4.91']){
 const t=new Transcoder(bytes);t.transcode('1.2.840.10008.1.2.'+suffix);writeFileSync('build/compressed-fixtures/'+suffix+'.dcm',Buffer.from(t.getDicomPart10()));console.log('encoded',suffix);
}

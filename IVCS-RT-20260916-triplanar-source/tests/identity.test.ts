import {test} from 'node:test';
import assert from 'node:assert/strict';
import {revisionForDate,REVISION_CODE} from '../src/appInfo';
import {exportMonacoRtStruct} from '../src/utils/monacoRtStructExporter';
import dicomParser from 'dicom-parser';

test('revision dates use Santiago rather than the UTC calendar day',()=>{
  assert.equal(revisionForDate(new Date('2026-09-09T02:30:00Z')),'20260908');
  assert.equal(revisionForDate(new Date('2026-09-09T04:00:00Z')),'20260909');
});

test('TPS export carries IVCS RT identity and a date code without changing contour geometry',async()=>{
  const slice={id:'s',sliceIndex:0,rows:4,cols:4,pixelSpacing:[1,1],sliceThickness:1,sliceLocation:0,imagePositionPatient:[0,0,0],imageOrientationPatient:[1,0,0,0,1,0],huData:new Int16Array(16),sopInstanceUID:'1.2.3.4',sopClassUID:'1.2.840.10008.5.1.4.1.1.2'};
  const series:any={patientId:'SYNTHETIC',patientName:'Synthetic^Identity',modality:'CT',seriesDescription:'Synthetic',studyInstanceUID:'1.2.3',seriesInstanceUID:'1.2.3.1',frameOfReferenceUID:'1.2.3.2',slices:[slice]};
  const roi:any={id:'r',name:'BODY',type:'EXTERNAL',color:'#00ffff',visible:true,locked:false,opacity:.3,sliceMasks:{0:new Uint8Array([0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0])}};
  const result=exportMonacoRtStruct(series,[roi]),data=dicomParser.parseDicom(new Uint8Array(await result.blob.arrayBuffer()));
  assert.equal(data.string('x00080070'),'IVCS RT');assert.equal(data.string('x00020013'),'IVCSRT_'+REVISION_CODE);
  assert.match(result.fileName,/^RS\.TPS_/);assert.ok(!/Monaco|Elekta|RadContour/.test(new TextDecoder().decode(await result.blob.arrayBuffer())));
});

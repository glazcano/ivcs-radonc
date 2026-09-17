import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDicomByteArray, parseMultipleDicomFiles } from '../src/utils/dicomParser';
import { patientPoint, sliceDistance, validateVolume, voxelDepth } from '../src/utils/geometry';
import { parseSession, serializeSession, Session } from '../src/utils/session';
import { createDemoRadiotherapyDataset } from '../src/utils/demoData';
import { exportMonacoRtStruct } from '../src/utils/monacoRtStructExporter';
import dicomParser from 'dicom-parser';

function dicom(options: {big?:boolean; signed?:boolean; bits?:number; values?:number[]; syntax?:string; modality?:string; series?:string; z?:number; intercept?:string; truncate?:boolean}={}) {
  const big=options.big || false, parts: Buffer[]=[];
  const element=(group:number, tag:number, vr:string, value: string|number|Buffer, little=!big)=> {
    let data: Buffer;
    if(typeof value==='number') { data=Buffer.alloc(2); little ? data.writeUInt16LE(value) : data.writeUInt16BE(value); }
    else data=typeof value==='string' ? Buffer.from(value) : value;
    if(data.length%2) data=Buffer.concat([data,Buffer.from([vr==='UI'?0:32])]);
    const long=['OW','OB'].includes(vr), header=Buffer.alloc(long?12:8);
    const u16=(v:number,o:number)=>little?header.writeUInt16LE(v,o):header.writeUInt16BE(v,o);
    u16(group,0);u16(tag,2);header.write(vr,4);
    if(long) little?header.writeUInt32LE(data.length,8):header.writeUInt32BE(data.length,8); else u16(data.length,6);
    parts.push(header,data);
  };
  parts.push(Buffer.alloc(128),Buffer.from('DICM'));
  element(2,16,'UI',options.syntax || (big?'1.2.840.10008.1.2.2':'1.2.840.10008.1.2.1'),true);
  element(8,22,'UI','1.2.840.10008.5.1.4.1.1.2'); element(8,24,'UI','1.2.3.'+(options.z||0));
  element(8,96,'CS',options.modality||'CT');element(16,32,'LO','patient');
  element(32,13,'UI','1.2.3');element(32,14,'UI',options.series||'1.2.4');element(32,82,'UI','1.2.5');
  element(32,50,'DS',`0\\0\\${options.z||0}`);element(32,55,'DS','1\\0\\0\\0\\1\\0');
  element(40,2,'US',1);element(40,4,'CS','MONOCHROME2');element(40,16,'US',2);element(40,17,'US',2);element(40,48,'DS','1\\1');
  element(40,256,'US',16);element(40,257,'US',options.bits||16);element(40,258,'US',(options.bits||16)-1);element(40,259,'US',options.signed?1:0);
  if(options.intercept!==undefined)element(40,4178,'DS',options.intercept);
  const pixels=Buffer.alloc(8);(options.values||[0,1,2,3]).forEach((v,i)=>big?pixels.writeUInt16BE(v,i*2):pixels.writeUInt16LE(v,i*2));
  element(0x7fe0,16,'OW',pixels);
  const result=Buffer.concat(parts);return new Uint8Array(options.truncate?result.subarray(0,-2):result);
}

test('reads little and big endian identically',()=> {
  for(const big of [false,true]) assert.deepEqual(Array.from(parseDicomByteArray(dicom({big,values:[0,256,1024,30000]})).slice.huData),[0,256,1024,30000]);
});
test('sign extends 12 bit data and ignores unused bits',()=>assert.deepEqual(Array.from(parseDicomByteArray(dicom({signed:true,bits:12,values:[4095,2048,2047,61441]})).slice.huData),[-1,-2048,2047,1]));
test('MR without intercept retains original intensity',()=>assert.equal(parseDicomByteArray(dicom({modality:'MR'})).slice.huData[1],1));
test('applies explicit rescale intercept',()=>assert.equal(parseDicomByteArray(dicom({intercept:'-1024'})).slice.huData[1],-1023));
test('rejects compressed pixels',()=>assert.throws(()=>parseDicomByteArray(dicom({syntax:'1.2.840.10008.1.2.4.50'})),/compresión|sintaxis/));
test('rejects truncated pixels and preserves unsigned intensities beyond Int16',()=> {
  assert.throws(()=>parseDicomByteArray(dicom({truncate:true})));
  const s=parseDicomByteArray(dicom({values:[65535,0,0,0]})).slice;assert.equal(s.pixelType,'f32');assert.equal(s.huData[0],65535);
});
test('sorts slices and consistently selects first CT as reference',async()=> {
 const file=(options:any)=>new File([dicom(options)],'image.dcm');
 const s:any=await parseMultipleDicomFiles([file({modality:'MR',series:'1.1'}),file({series:'1.2',z:3}),file({series:'1.2',z:0}),file({series:'1.3'})]);
 assert.equal(s.seriesInstanceUID,'1.2'); assert.equal(s.studies[0].id,'study-1.2'); assert.equal(s.slices[0].sliceLocation,0);
});
test('rejects incomplete imports instead of dropping failed slices',async()=>assert.rejects(()=>parseMultipleDicomFiles([new File([dicom()],'good.dcm'),new File([dicom({truncate:true})],'bad.dcm')])));
test('patient coordinates respect oblique orientation and actual origin',()=> {
 const s=parseDicomByteArray(dicom()).slice;
 s.imagePositionPatient=[10,20,30];s.imageOrientationPatient=[0,1,0,0,0,1];s.pixelSpacing=[2,3];
 assert.deepEqual(patientPoint(s,2,4),[10,26,38]);assert.equal(sliceDistance(s),10);
 assert.throws(()=>validateVolume([s]),/oblicua/);
});
test('rejects duplicate slices and uses distance rather than thickness',()=> {
 const a=parseDicomByteArray(dicom()).slice,b=parseDicomByteArray(dicom({z:3})).slice;
 assert.throws(()=>validateVolume([a,a]),/duplicados/);assert.equal(voxelDepth([a,b],a),3);
});
function session():Session {
 const d=createDemoRadiotherapyDataset();
 return {format:'radcontour-session',version:1,...d,rois:d.initialRois,currentSliceIndex:0,activeRoiId:d.initialRois[0].id,windowCenter:40,windowWidth:400,registrationState:{active:false,referenceStudyId:d.studies[0].id,secondaryStudyId:d.studies[1].id,transforms:{},voi:{},fusionMode:'blend',fusionOpacity:0.5,checkerboardSize:32,splitPosition:0.5,secondaryWindowCenter:40,secondaryWindowWidth:400,secondaryColorMap:'grayscale'} as any};
}
test('portable session round trip preserves images and masks',()=> {
 const s=session(), restored=parseSession(serializeSession(s));
 assert.deepEqual(restored.series.slices[0].huData,s.series.slices[0].huData);
 assert.deepEqual(restored.rois,s.rois);
});
test('rejects old reports and corrupt masks',()=> {
 assert.throws(()=>parseSession('{"version":"1.0","structures":[]}'),/no contienen/);
 const s=session();s.rois[0].sliceMasks[0]=new Uint8Array([1]);assert.throws(()=>parseSession(serializeSession(s)),/Máscara/);
});
test('demo cannot fabricate RTSTRUCT references',()=> {
 const d=createDemoRadiotherapyDataset();const missing={...d.series,slices:d.series.slices.map(s=>({...s,sopInstanceUID:undefined}))};assert.throws(()=>exportMonacoRtStruct(missing,d.initialRois),/identificadores/);
});
test('RTSTRUCT keeps image references and readable contour coordinates',async()=> {
 const parsed=parseDicomByteArray(dicom());
 const slice={...parsed.slice,rows:16,cols:16,huData:new Int16Array(256)};
 const mask=new Uint8Array(256);
 for(let y=3;y<12;y++)for(let x=3;x<12;x++)mask[y*16+x]=1;
 const series={...parsed.seriesInfo,slices:[slice]} as any;
 const roi={id:'test',name:'Test',type:'PTV',color:'#ff0000',visible:true,locked:false,opacity:0.5,sliceMasks:{0:mask}} as any;
 const result=exportMonacoRtStruct(series,[roi]);
 assert.ok(result.summary.totalContoursCount>0);
 const ds:any=dicomParser.parseDicom(new Uint8Array(await result.blob.arrayBuffer()));
 assert.equal(ds.string('x00080060'),'RTSTRUCT');
 assert.equal(ds.string('x0020000d'),series.studyInstanceUID);
 const contour=ds.elements.x30060039.items[0].dataSet.elements.x30060040.items[0].dataSet;
 assert.ok(contour.string('x30060050').split('\\').length>=9);
 const image=contour.elements.x30060016.items[0].dataSet;
 assert.equal(image.string('x00081155'),slice.sopInstanceUID);
 assert.equal(image.string('x00081150'),slice.sopClassUID);
});

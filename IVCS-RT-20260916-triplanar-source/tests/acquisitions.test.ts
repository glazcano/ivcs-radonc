import {enhancedFixture as enhanced} from './helpers/enhancedFixture';
import test from 'node:test';
import assert from 'node:assert/strict';
import codecs from 'dcmjs-codecs';
import JSZip from 'jszip';
import {obliqueFixture,fixtureDicom} from './helpers/obliqueFixture';
import {parseMultipleDicomFiles,inspectDicomFiles,parseDicomFrames,parseDicomByteArray} from '../src/utils/dicomParser';
import {resampleAxial} from '../src/utils/axialResampling';
import {volumeSampler} from '../src/utils/volumeSampling';
import {derivedDicomImages} from '../src/utils/derivedDicom';
import {checkedOriginals} from '../src/utils/dicomBundle';
import {patientPoint} from '../src/utils/geometry';
import {encodeLibrary,decodeLibrary,defaultRegistration} from '../src/utils/libraryClient';
import {parseSession,serializeSession} from '../src/utils/session';
import {temporalPlane,combineTemporalPlanes,unionPhaseMasks} from '../src/utils/temporal';

test('Enhanced MR frames separate temporal positions and retain original frame references',async()=>{
 const bytes=enhanced(),file=new File([bytes],'enhanced.dcm'),groups=await inspectDicomFiles([file]);assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.frames),[3,3]);
 const frames=await parseDicomFrames(bytes,'enhanced.dcm');assert.equal(frames.length,6);assert.equal(frames[3].slice.huData[0],110);assert.equal(frames[3].slice.frameNumber,4);
 const series:any=await parseMultipleDicomFiles([file]);assert.equal(series.studies.length,2);assert.notEqual(series.studies[0].seriesInstanceUID,series.studies[1].seriesInstanceUID);
 const selected:any=await parseMultipleDicomFiles([file],undefined,new Set(),new Set([groups[1].key]));assert.equal(selected.studies.length,1);assert.equal(selected.sourceVolume.slices[0].frameNumber,4);
 const archive=new JSZip();archive.file('original.dcm',bytes);const originals=await checkedOriginals(selected.sourceVolume,await archive.generateAsync({type:'uint8array'}));assert.equal(originals.length,1);assert.deepEqual(originals[0],bytes);
 const derived=await derivedDicomImages(selected,originals);assert.equal(parseDicomByteArray(derived[0]).slice.sopClassUID,'1.2.840.10008.5.1.4.1.1.4');assert.equal(parseDicomByteArray(derived[0]).slice.huData[0],110);
});
test('parallel irregular sampling uses physical distances and leaves large gaps unfilled',async()=>{
 const series=obliqueFixture();const positions=[0,2,4.5,6.5,20];
 series.slices.forEach((s,i)=>{s.imageOrientationPatient=[1,0,0,0,1,0];s.imagePositionPatient=[0,0,positions[i]];s.huData.fill(positions[i]*10);});
 const sample=volumeSampler(series);assert.equal(sample(2,2,3),30);assert.equal(sample(2,2,12),null);assert.equal(sample(2,2,20),200);
 const out=await resampleAxial(series);assert.equal(out.resampling!.method,'parallel-irregular-v1');
 const gap=out.slices.find(s=>s.imagePositionPatient![2]>10 && s.imagePositionPatient![2]<15)!;assert.ok(gap.valid!.every(v=>v===0));
 for(const s of series.slices)assert.equal(sample(...patientPoint(s,2,2)),s.huData[18]);
});
test('temporal tags split nonoverlapping coverage instead of merging phases',async()=>{
 const source=obliqueFixture();const files=fixtureDicom(source).map((b,i)=>{const t=new codecs.Transcoder(b.slice().buffer);(t.getElements() as any).TemporalPositionIdentifier=i<2?'1':'2';return new File([t.getDicomPart10()],i+'.dcm');});
 const groups=await inspectDicomFiles(files);assert.equal(groups.length,2);const parsed:any=await parseMultipleDicomFiles(files);assert.equal(parsed.studies.length,2);
});
test('fractional MR scaling and MONOCHROME1 survive storage and session round trips',async()=>{
 const t=new codecs.Transcoder(fixtureDicom(obliqueFixture())[0].slice().buffer),e=t.getElements() as any;e.RescaleSlope=.00001;e.RescaleIntercept=.00003;e.PhotometricInterpretation='MONOCHROME1';e.RescaleType='US';
 const parsed=await parseMultipleDicomFiles([new File([t.getDicomPart10()],'adc.dcm')]),s=parsed.slices[0];assert.equal(s.pixelType,'f32');assert.ok(s.huData instanceof Float32Array);assert.ok(s.inverted);assert.equal(s.units,'US');
 const decoded=decodeLibrary(encodeLibrary(parsed));assert.deepEqual(decoded.slices[0].huData,s.huData);
 const study={...parsed,id:'adc'},session:any={format:'radcontour-session',version:1,series:parsed,studies:[study],rois:[],currentSliceIndex:0,activeRoiId:null,windowCenter:.002,windowWidth:.004,registrationState:defaultRegistration('adc')};
 assert.deepEqual(parseSession(serializeSession(session)).series.slices[0].huData,s.huData);
 await assert.rejects(derivedDicomImages(parsed,[new Uint8Array(t.getDicomPart10())]),/decimales/);
});
test('temporal MIP/AIP preserves phase motion and excludes incomplete coverage',()=>{
 const base=obliqueFixture();base.slices.forEach((s,i)=>{s.imageOrientationPatient=[1,0,0,0,1,0];s.imagePositionPatient=[0,0,i*2];s.huData.fill(10);});
 const moving={...base,slices:base.slices.map(s=>({...s,huData:new Int16Array(s.huData.length).fill(30)}))};
 const planes=[temporalPlane(base.slices[1],base),temporalPlane(base.slices[1],moving)];assert.equal(combineTemporalPlanes(planes,'MIP').values[0],30);assert.equal(combineTemporalPlanes(planes,'AIP').values[0],20);planes[1].valid[0]=0;assert.equal(combineTemporalPlanes(planes,'AIP').valid[0],0);
 const a=new Uint8Array(56),b=new Uint8Array(56);a[9]=1;b[11]=1;const roi:any={sliceMasks:{1:a}},other:any={sliceMasks:{1:b}};
 const union=unionPhaseMasks(base,[{series:base,roi},{series:moving,roi:other}]);assert.equal(union[1][9],1);assert.equal(union[1][11],1);assert.equal(a[11],0);
 const outside={...moving,slices:moving.slices.map(s=>({...s,imagePositionPatient:[100,0,s.imagePositionPatient![2]] as [number,number,number]}))};assert.throws(()=>unionPhaseMasks(base,[{series:outside,roi:other}]),/field of view/);
});
test('Enhanced CT lossless multiframe decoding preserves frame pixels',async()=>{
 await codecs.NativeCodecs.initializeAsync();const t=new codecs.Transcoder(enhanced().slice().buffer);const e=t.getElements() as any;e.SOPClassUID='1.2.840.10008.5.1.4.1.1.2.1';e.Modality='CT';t.transcode('1.2.840.10008.1.2.4.80');
 const parsed=await parseDicomFrames(new Uint8Array(t.getDicomPart10()),'ct.dcm');assert.equal(parsed.length,6);assert.equal(parsed[4].slice.huData[0],110);assert.equal(parsed[4].slice.frameNumber,5);assert.ok(parsed.every(p=>p.slice.sourceCompressed));
});
test('native Float Pixel Data retains ADC fractions and declared real-world units',async()=>{
 const t=new codecs.Transcoder(enhanced().slice().buffer),e=t.getElements() as any;
 e.SOPClassUID='1.2.840.10008.5.1.4.1.1.30';e.BitsAllocated=32;delete e.BitsStored;delete e.HighBit;delete e.PixelRepresentation;delete e.PixelData;
 e.FloatPixelData=[new Float32Array(6*56).fill(.00125).buffer];e._vrMap={FloatPixelData:'OF'};
 e.SharedFunctionalGroupsSequence[0].RealWorldValueMappingSequence=[{DoubleFloatRealWorldValueFirstValueMapped:0,DoubleFloatRealWorldValueLastValueMapped:1,RealWorldValueSlope:1,RealWorldValueIntercept:0,MeasurementUnitsCodeSequence:[{CodeValue:'mm2/s',CodingSchemeDesignator:'UCUM',CodeMeaning:'square millimeter per second'}]}];
 for(const frame of e.PerFrameFunctionalGroupsSequence)delete frame.PixelValueTransformationSequence;
 const bytes=new Uint8Array(new codecs.Transcoder(e,'1.2.840.10008.1.2.1').getDicomPart10()),frames=await parseDicomFrames(bytes,'map.dcm');
 assert.equal(frames[0].slice.huData[0],Math.fround(.00125));assert.equal(frames[0].slice.units,'mm2/s');assert.equal(frames[0].slice.pixelType,'f32');
});

import codecs from 'dcmjs-codecs';
import {obliqueFixture,fixtureDicom} from './obliqueFixture';
export function enhancedFixture(){
 const base=new codecs.Transcoder(fixtureDicom(obliqueFixture())[0].slice().buffer).getElements() as any;
 base.SOPClassUID='1.2.840.10008.5.1.4.1.1.4.1';base.NumberOfFrames=6;base.WindowCenter=50;base.WindowWidth=200;
 base.SharedFunctionalGroupsSequence=[{PixelMeasuresSequence:[{PixelSpacing:[1,1],SliceThickness:2}],PlaneOrientationSequence:[{ImageOrientationPatient:[1,0,0,0,1,0]}]}];
 base.PerFrameFunctionalGroupsSequence=Array.from({length:6},(_,i)=>({PlanePositionSequence:[{ImagePositionPatient:[0,0,(i%3)*2]}],FrameContentSequence:[{TemporalPositionIndex:Math.floor(i/3)+1,StackID:'1'}],PixelValueTransformationSequence:[{RescaleSlope:1,RescaleIntercept:Math.floor(i/3)*100}]}));
 base.PixelData=[new Int16Array(6*56).fill(10).buffer];
 for(const k of ['ImagePositionPatient','ImageOrientationPatient','PixelSpacing','SliceThickness'])delete base[k];
 return new Uint8Array(new codecs.Transcoder(base,'1.2.840.10008.1.2.1').getDicomPart10());
}

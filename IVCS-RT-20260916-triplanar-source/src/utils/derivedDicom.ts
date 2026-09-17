import type {DicomSeries} from '../types';
/** Preserve acquisition metadata from the actual original, replacing all image-grid
 * and pixel representation fields for the derived axial single-frame instances. */
export async function derivedDicomImages(series:DicomSeries,originals:Uint8Array[]){
 if(!series.sourceVolume || !series.resampling || !originals.length)throw new Error('Referencia de reconstrucción inválida.');
 if(series.slices.some(s=>s.pixelType==='f32'))throw new Error('La reconstrucción contiene valores decimales. La exportación DICOM derivada de estos mapas aún no está disponible; no se cuantizaron los valores.');
 const {default:codecs}=await import('dcmjs-codecs'),source=series.sourceVolume;
 const first=source.slices[0],buffer=originals[0].slice().buffer;
 const transcoder=new codecs.Transcoder(buffer,first.sourceRaw?first.sourceTransferSyntax:undefined),base=transcoder.getElements();
 const refs=source.slices.map(s=>({ReferencedSOPClassUID:s.sopClassUID,ReferencedSOPInstanceUID:s.sopInstanceUID,...(s.frameNumber?{ReferencedFrameNumber:s.frameNumber}:{})}));
 return series.slices.map((s,i)=>{
  const elements:any={...base,_vrMap:{...(base._vrMap as object || {}),PixelData:"OW",PixelPaddingValue:"SS"},SpecificCharacterSet:'ISO_IR 192',ImageType:['DERIVED','SECONDARY','MPR'],SOPInstanceUID:s.sopInstanceUID,SeriesInstanceUID:series.seriesInstanceUID,FrameOfReferenceUID:series.frameOfReferenceUID,SeriesDescription:series.seriesDescription.slice(0,64),SeriesNumber:9001,InstanceNumber:i+1,
   ImagePositionPatient:s.imagePositionPatient!.map(v=>Number(v.toPrecision(12))),ImageOrientationPatient:s.imageOrientationPatient,SliceLocation:Number(s.sliceLocation.toPrecision(12)),PixelSpacing:s.pixelSpacing.map(v=>Number(v.toPrecision(12))),SliceThickness:Number(s.sliceThickness.toPrecision(12)),SpacingBetweenSlices:Number(s.sliceThickness.toPrecision(12)),
   Rows:s.rows,Columns:s.cols,SamplesPerPixel:1,PhotometricInterpretation:s.inverted?'MONOCHROME1':'MONOCHROME2',BitsAllocated:16,BitsStored:16,HighBit:15,PixelRepresentation:1,RescaleSlope:1,RescaleIntercept:0,
   PixelPaddingValue:-32768,PixelData:[s.huData.slice().buffer],SourceImageSequence:refs,DerivationDescription:'IVCS RT axial MPR; trilinear interpolation in patient LPS; original images retained; padding is outside acquisition support.'};
  for(const key of ['NumberOfFrames','PlanarConfiguration','PixelPaddingRangeLimit','SmallestImagePixelValue','LargestImagePixelValue','PatientOrientation','SliceProgressionDirection','DataSetTrailingPadding','DigitalSignaturesSequence','MACParametersSequence'])delete elements[key];
  elements.SOPClassUID=s.sopClassUID;
  for(const key of ['SharedFunctionalGroupsSequence','PerFrameFunctionalGroupsSequence','DimensionOrganizationSequence','DimensionIndexSequence','ConcatenationUID','InConcatenationNumber','InConcatenationTotalNumber','ConcatenationFrameOffsetNumber'])delete elements[key];
  if(series.slices.some(slice=>slice.minHU===-32768))delete elements.PixelPaddingValue;
  if(series.modality==='CT')elements.RescaleType='HU';
  return new Uint8Array(new codecs.Transcoder(elements,'1.2.840.10008.1.2.1').getDicomPart10());
 });
}

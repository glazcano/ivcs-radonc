import {readDicomDataset,transferSyntax,acquisitionToken,acquisitionDimensions} from './dicomDataset.mjs';
import {decodeCompressedDicom} from './decodeCompressedDicom';
import {dicomText} from './dicomText';
import {frameDataset} from './dicomFrames.mjs';
import {axialForViewer} from './resampleClient';
import {acquisitionGeometry} from './volumeSampling';
import { sliceDistance, validateVolume } from './geometry';
import dicomParser, { DataSet } from 'dicom-parser';
import JSZip from 'jszip';
import { DicomSeries, DicomSlice, ImageStudy } from '../types';

export interface ParsedSeriesInfo extends Partial<DicomSeries> {
  seriesInstanceUID?: string;
  studyInstanceUID?: string;
  frameOfReferenceUID?: string;
  patientBirthDate?: string;
  patientSex?: string;
  studyDate?: string;
  studyTime?: string;
  accessionNumber?: string;
}

export function parseDicomByteArray(
  byteArray: Uint8Array,
  fileName: string = 'slice.dcm',
  frame?: {dataSet:DataSet; index:number}
): { slice: DicomSlice; seriesInfo: ParsedSeriesInfo } {
  let dataSet: DataSet;
  try {
    dataSet = frame?.dataSet || readDicomDataset(byteArray);
  } catch (err) {
    throw new Error(`Error al leer archivo DICOM: ${fileName} - ${(err as Error).message}`);
  }

  // Extract metadata tags
  const patientName = dicomText(dataSet,'x00100010') || 'Anonimizado';
  const patientId = dicomText(dataSet,'x00100020') || 'ID_DESCONOCIDO';
  const patientBirthDate = dataSet.string('x00100030') || '';
  const patientSex = dataSet.string('x00100040') || '';
  const studyDate = dataSet.string('x00080020') || '';
  const studyTime = dataSet.string('x00080030') || '';
  const accessionNumber = dataSet.string('x00080050') || '';

  const seriesInstanceUID = dataSet.string('x0020000e') || `1.2.826.0.1.3680043.9.7126.2.${Date.now()}`;
  const studyInstanceUID = dataSet.string('x0020000d') || `1.2.826.0.1.3680043.9.7126.1.${Date.now()}`;
  const frameOfReferenceUID = dataSet.string('x00200052') || `1.2.826.0.1.3680043.9.7126.3.${Date.now()}`;
  const sopInstanceUID = dataSet.string('x00080018') || `1.2.826.0.1.3680043.9.7126.4.${Date.now()}.${Math.floor(Math.random() * 1000000)}`;
  const sopClassUID = dataSet.string('x00080016') || '1.2.840.10008.5.1.4.1.1.2'; // CT Image Storage default

  const studyDescription = dicomText(dataSet,'x00081030') || 'Planificación Radioterapia';
  const seriesDescription = dicomText(dataSet,'x0008103e') || 'Corte Tomografía CT';
  const modality = (dataSet.string('x00080060') || 'CT').toUpperCase();

  const rows = dataSet.uint16('x00280010') || 512;
  const cols = dataSet.uint16('x00280011') || 512;

  // Pixel Spacing
  let pixelSpacing: [number, number] = [1.0, 1.0];
  const pixelSpacingStr = dataSet.string('x00280030');
  if (pixelSpacingStr) {
    const parts = pixelSpacingStr.split('\\').map(p => parseFloat(p.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      pixelSpacing = [parts[0], parts[1]];
    }
  }

  // Slice Thickness
  let sliceThickness = 2.5;
  const thicknessStr = dataSet.string('x00180050');
  if (thicknessStr) {
    const parsed = parseFloat(thicknessStr);
    if (!isNaN(parsed) && parsed > 0) sliceThickness = parsed;
  }

  // Slice Location / Image Position Patient Z
  let sliceLocation = 0;
  let imagePositionPatient: [number, number, number] = [-250, -250, 0];
  const imgPosStr = dataSet.string('x00200032');
  if (imgPosStr) {
    const coords = imgPosStr.split('\\').map(p => parseFloat(p.trim()));
    if (coords.length >= 3 && !isNaN(coords[0]) && !isNaN(coords[1]) && !isNaN(coords[2])) {
      imagePositionPatient = [coords[0], coords[1], coords[2]];
      sliceLocation = coords[2];
    }
  } else {
    const sliceLocationStr = dataSet.string('x00201041');
    if (sliceLocationStr) {
      sliceLocation = parseFloat(sliceLocationStr) || 0;
      imagePositionPatient = [-250, -250, sliceLocation];
    }
  }

  // Image Orientation Patient (Row and Column Cosines)
  let imageOrientationPatient: [number, number, number, number, number, number] = [1, 0, 0, 0, 1, 0];
  const imgOrientStr = dataSet.string('x00200037');
  if (imgOrientStr) {
    const parts = imgOrientStr.split('\\').map(p => parseFloat(p.trim()));
    if (parts.length >= 6 && parts.every(v => !isNaN(v))) {
      imageOrientationPatient = [parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]];
    }
  }

  // Rescale Slope & Intercept
  let rescaleSlope = 1.0;
  const slopeStr = dataSet.string('x00281053');
  if (slopeStr) {
    const val = parseFloat(slopeStr);
    if (!isNaN(val)) rescaleSlope = val;
  }

  let rescaleIntercept = 0;
  const interceptStr = dataSet.string('x00281052');
  if (interceptStr) {
    const val = parseFloat(interceptStr);
    if (!isNaN(val)) rescaleIntercept = val;
  }

  // Window Center and Width
  let windowCenter = 40;
  const wcStr = dataSet.string('x00281050');
  if (wcStr) {
    const firstWc = wcStr.split('\\')[0];
    const val = parseFloat(firstWc);
    if (!isNaN(val)) windowCenter = val;
  }

  let windowWidth = 400;
  const wwStr = dataSet.string('x00281051');
  if (wwStr) {
    const firstWw = wwStr.split('\\')[0];
    const val = parseFloat(firstWw);
    if (!isNaN(val)) windowWidth = val;
  }

  // Pixel representation & Bits Allocated
  const bitsAllocated = dataSet.uint16('x00280100') || 16;
  const pixelRepresentation = dataSet.uint16('x00280103') || 0; // 0 = unsigned, 1 = signed

  // Pixel Data Element (7FE0, 0010)
  const floatPixels=!!dataSet.elements['x7fe00008'];
  const pixelDataElement = dataSet.elements['x7fe00010'] || dataSet.elements['x7fe00008'];
  if (!pixelDataElement) {
    throw new Error(`No se encontraron datos de píxeles (PixelData 7FE0,0010) en el archivo ${fileName}`);
  }

  const syntax = transferSyntax(dataSet);
  for (const [value, count] of [[imgPosStr, 3], [imgOrientStr, 6], [pixelSpacingStr, 2]] as const) {
    const parts = value?.split('\\');
    if (!parts || parts.length !== count || parts.some(p => p.trim() === '' || !Number.isFinite(Number(p)))) throw new Error(fileName + ': geometría DICOM inválida.');
  }
  if ((slopeStr && !Number.isFinite(Number(slopeStr))) || (interceptStr && !Number.isFinite(Number(interceptStr)))) throw new Error(fileName + ': transformación de intensidad inválida.');
  for (const tag of ['x0020000d','x0020000e','x00200052','x00080018','x00080016']) {
    if (!dataSet.string(tag)) throw new Error(fileName + ': falta un identificador DICOM necesario para conservar las referencias.');
  }
  if (!Number.isFinite(rescaleSlope) || rescaleSlope === 0 || !Number.isFinite(rescaleIntercept)) throw new Error(fileName + ': transformación de intensidad inválida.');
  if (!['1.2.840.10008.1.2', '1.2.840.10008.1.2.1', '1.2.840.10008.1.2.2'].includes(syntax || '') || pixelDataElement.encapsulatedPixelData) throw new Error(fileName + ': compresión o sintaxis DICOM no compatible. Exporte imágenes sin compresión.');
  if ((!frame && (dataSet.intString('x00280008') || 1) !== 1) || (dataSet.uint16('x00280002') || 1) !== 1 || !['MONOCHROME1','MONOCHROME2'].includes(dataSet.string('x00280004') || '')) throw new Error(fileName + ': formato de imagen no compatible.');
  const bitsStored = dataSet.uint16('x00280101') || bitsAllocated;
  const highBit = dataSet.uint16('x00280102') ?? (bitsStored-1);
  if ((floatPixels?bitsAllocated!==32:![8,16].includes(bitsAllocated)) || bitsStored < 1 || bitsStored > bitsAllocated || highBit !== bitsStored-1 || ![0,1].includes(pixelRepresentation)) throw new Error(fileName + ': formato de píxel no compatible.');
  if (!dataSet.uint16('x00280010') || !dataSet.uint16('x00280011') || !pixelSpacingStr || !imgPosStr || !imgOrientStr) throw new Error(fileName + ': faltan dimensiones o geometría DICOM.');
  const numPixels = rows * cols;
  const byteLength = numPixels * bitsAllocated / 8;
  const frameOffset=(frame?.index || 0)*byteLength,offset=pixelDataElement.dataOffset+frameOffset;
  if (pixelDataElement.length < frameOffset+byteLength || offset + byteLength > dataSet.byteArray.length) throw new Error(fileName + ': datos de píxel truncados.');
  const view = new DataView(dataSet.byteArray.buffer, dataSet.byteArray.byteOffset + offset, byteLength);
  // Preserve fractional rescale values and unsigned values beyond Int16.
  let floating=floatPixels,huData:Int16Array|Float32Array = floatPixels?new Float32Array(numPixels):new Int16Array(numPixels);
  let units=dataSet.string('x00281054') || dataSet.string('x00541001') || (modality==='CT'?'HU':undefined);
  let mappingRange:[number,number]|undefined;
  const mappings=(dataSet.elements.x00409096 as any)?.items;
  if(mappings){
    if(mappings.length!==1)throw new Error('Multiple real-world mappings require explicit selection and are not supported.');
    const map=mappings[0].dataSet,slope=map.double('x00409225'),intercept=map.double('x00409224');
    if(!Number.isFinite(slope) || slope===0 || !Number.isFinite(intercept) || map.elements.x00409212)throw new Error('Only a single linear real-world value mapping is supported.');
    if((slopeStr && Number(slopeStr)!==1) || (interceptStr && Number(interceptStr)!==0))throw new Error('Combined modality rescale and real-world mapping requires explicit interpretation.');
    rescaleSlope=slope;rescaleIntercept=intercept;
    const integer=(tag:string)=>floatPixels || pixelRepresentation===1?map.int16(tag):map.uint16(tag);
    mappingRange=[map.elements.x00409214?map.double('x00409214'):integer('x00409216'),map.elements.x00409213?map.double('x00409213'):integer('x00409211')];
    if(!mappingRange.every(Number.isFinite) || mappingRange[0]>mappingRange[1])throw new Error('Missing or invalid real-world mapping range.');
    const unit=map.elements.x004008ea?.items?.[0]?.dataSet;units=unit?.string('x00080100') || unit?.string('x00080104');
    if(!units)throw new Error('Missing real-world measurement units.');
  }
  let minHU = Infinity, maxHU = -Infinity;
  for (let i = 0; i < numPixels; i++) {
    let raw = floatPixels?view.getFloat32(i*4,syntax !== '1.2.840.10008.1.2.2'):(bitsAllocated === 8 ? view.getUint8(i) : view.getUint16(i*2, syntax !== '1.2.840.10008.1.2.2')) & (2**bitsStored-1);
    if (!floatPixels && pixelRepresentation === 1 && raw >= 2**(bitsStored-1)) raw -= 2**bitsStored;
    if(mappingRange && (raw<mappingRange[0] || raw>mappingRange[1]))throw new Error('Pixel values outside the declared real-world mapping range are not extrapolated.');
    const scaled=raw*rescaleSlope + rescaleIntercept;
    if(!floating && (!Number.isInteger(scaled) || scaled<-32768 || scaled>32767)){floating=true;huData=new Float32Array(huData);}
    const value = floating?Math.fround(scaled):scaled;
    if (!Number.isFinite(value) || (!floating && (value < -32768 || value > 32767))) throw new Error(fileName + ': intensidad fuera del rango admitido por el visor.');
    huData[i] = value;
    minHU = Math.min(minHU, value); maxHU = Math.max(maxHU, value);
  }

  const slice: DicomSlice = {
    pixelType:floating?'f32':'i16',
    inverted:dataSet.string('x00280004')==='MONOCHROME1',
    units,
    frameNumber: (dataSet as any).frameNumber,
    id: `slice-${Math.random().toString(36).substring(2, 9)}`,
    sliceIndex: 0,
    rows,
    cols,
    pixelSpacing,
    sliceThickness,
    sliceLocation,
    windowCenter,
    windowWidth,
    rescaleIntercept,
    rescaleSlope,
    huData,
    minHU,
    maxHU,
    fileName,
    sourceTransferSyntax: syntax,
    sourceRaw: !!(dataSet as any).ivcsRaw,
    sourceCompressed: false,
    sourceLossy: dataSet.string('x00282110') === '01',
    sopInstanceUID,
    sopClassUID,
    imagePositionPatient,
    imageOrientationPatient
  };

  const seriesInfo: ParsedSeriesInfo = {
    patientName: cleanPatientName(patientName),
    patientId,
    patientBirthDate,
    patientSex,
    studyDate,
    studyTime,
    accessionNumber,
    studyDescription,
    seriesDescription,
    modality,
    seriesInstanceUID,
    studyInstanceUID,
    frameOfReferenceUID,
    acquisitionKey: acquisitionToken(dataSet)
    ,acquisitionDimensions: Object.fromEntries(acquisitionDimensions(dataSet))
  };

  return { slice, seriesInfo };
}

export async function parseDicomFile(file: File): Promise<{ slice: DicomSlice; seriesInfo: ParsedSeriesInfo }> {
  const arrayBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);
  return parseDicomImage(byteArray, file.name);
}

function cleanPatientName(raw: string): string {
  if (!raw) return 'Paciente Anónimo';
  return raw.replace(/\^/g, ' ').trim() || 'Paciente Anónimo';
}

function isLikelyDicom(byteArray: Uint8Array, fileName: string): boolean {
  if (byteArray.length < 132) return false;
  // Check 'DICM' magic at offset 128
  if (
    byteArray[128] === 0x44 && // 'D'
    byteArray[129] === 0x49 && // 'I'
    byteArray[130] === 0x43 && // 'C'
    byteArray[131] === 0x4D    // 'M'
  ) {
    return true;
  }
  // If file extension is .dcm
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.dcm') || lower.endsWith('.dicom') || lower.endsWith('.ima')) {
    return true;
  }
  // Tag group 0x0002 or 0x0008
  if ((byteArray[0] === 0x02 || byteArray[0] === 0x08) && byteArray[1] === 0x00) {
    return true;
  }
  return false;
}

/**
 * Extracts all DICOM slices from a .ZIP archive
 */
export async function extractDicomFromZip(
  zipBuffer: ArrayBuffer | Uint8Array,
  onProgress?: (msg: string) => void
): Promise<Array<{ slice: DicomSlice; seriesInfo: Partial<DicomSeries> }>> {
  if (onProgress) onProgress('Descomprimiendo archivo ZIP...');
  const zip = await JSZip.loadAsync(zipBuffer);

  const entries: { name: string; file: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, file) => {
    if (!file.dir && !relativePath.startsWith('__MACOSX/') && !relativePath.includes('/.') && !relativePath.startsWith('.')) {
      entries.push({ name: relativePath, file });
    }
  });

  if (entries.length === 0) {
    throw new Error('El archivo ZIP no contiene ningún archivo legible.');
  }

  if (onProgress) onProgress(`Analizando ${entries.length} archivos dentro del ZIP...`);

  const results: Array<{ slice: DicomSlice; seriesInfo: Partial<DicomSeries> }> = [];
  let parsedCount = 0;

  for (const entry of entries) {
    const bytes = await entry.file.async('uint8array');
    if (isLikelyDicom(bytes, entry.name)) results.push(...await parseDicomFrames(bytes, entry.name));
  }

  if (results.length === 0) {
    throw new Error('No se encontraron cortes DICOM válidos dentro del archivo .ZIP.');
  }

  return results;
}

export async function parseMultipleDicomFiles(
  files: File[],
  onProgress?: (msg: string) => void,
  splitSeriesUIDs = new Set<string>(),
  selectedKeys?:Set<string>,signal?:AbortSignal
): Promise<DicomSeries> {
  if (files.length === 0) {
    throw new Error('No se seleccionaron archivos.');
  }

  const allResults: Array<{ slice: DicomSlice; seriesInfo: Partial<DicomSeries> }> = [];

  for (let i = 0; i < files.length; i++) {
    signal?.throwIfAborted();
    const file = files[i];
    const isZip = file.name.toLowerCase().endsWith('.zip') || 
                  file.type === 'application/zip' || 
                  file.type === 'application/x-zip-compressed';

    if (isZip) {
      if (onProgress) onProgress(`Abriendo archivo ZIP: ${file.name}...`);
      const zipBuffer = await file.arrayBuffer();
      const zipResults = await extractDicomFromZip(zipBuffer, onProgress);
      allResults.push(...zipResults);
    } else {
      try {
        allResults.push(...await parseDicomFrames(new Uint8Array(await file.arrayBuffer()),file.name,selectedKeys,signal));
      } catch (err) {
        throw err;
      }
    }
  }

  if (allResults.length === 0) {
    throw new Error('No se pudo decodificar ningún corte DICOM válido de los archivos proporcionados.');
  }

  if (onProgress) onProgress(`Ordenando y clasificando ${allResults.length} cortes DICOM...`);

  // Repeated positions in one series may represent different acquisitions, never duplicate-drop them.
  const positions=new Map<string,Set<string>>();
  const dimensionGroups=new Map<string,Set<string>>();
  for(const item of allResults){const uid=item.seriesInfo.seriesInstanceUID || '',seen=dimensionGroups.get(uid) || new Set<string>();seen.add(JSON.stringify(item.seriesInfo.acquisitionDimensions || {}));dimensionGroups.set(uid,seen);}
  for(const item of allResults){const uid=item.seriesInfo.seriesInstanceUID || '',pos=JSON.stringify(item.slice.imagePositionPatient);const seen=positions.get(uid) || new Set<string>();if(seen.has(pos))splitSeriesUIDs.add(uid);seen.add(pos);positions.set(uid,seen);}
  // Group slices by Series Instance UID or modality
  const groupMap = new Map<string, Array<{ slice: DicomSlice; seriesInfo: Partial<DicomSeries> }>>();
  for (const item of allResults) {
    const info = item.seriesInfo as any;
    if(selectedKeys && !selectedKeys.has(info.patientId+'|'+info.seriesInstanceUID) && !selectedKeys.has(info.patientId+'|'+info.seriesInstanceUID+'|'+info.acquisitionKey))continue;
    const split=splitSeriesUIDs.has(info.seriesInstanceUID) || (dimensionGroups.get(info.seriesInstanceUID)?.size || 0)>1;
    if(split && !info.acquisitionKey)throw new Error('Posiciones repetidas sin identificador de adquisición; no se mezclaron imágenes.');
    const key = info.seriesInstanceUID+(split?'|'+info.acquisitionKey:'');
    if(!split)delete info.acquisitionKey;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(item);
  }

  const studies: ImageStudy[] = [];
  let primarySeries: DicomSeries | null = null;

  let studyIdx = 1;
  for (const [key, items] of groupMap.entries()) {
    signal?.throwIfAborted();
    items.sort((a, b) => sliceDistance(a.slice) - sliceDistance(b.slice));
    const sortedSlices = items.map((r, idx) => ({
      ...r.slice,
      sliceIndex: idx
    }));
    if(new Set(sortedSlices.map(s=>s.units || '')).size>1)throw new Error('La adquisición contiene unidades de intensidad diferentes; no se combinaron sus cuadros.');

    acquisitionGeometry(sortedSlices,true);
    const info = items[0].seriesInfo;
    const modality = info.modality || 'CT';
    const isPet = modality.includes('PET') || modality === 'PT';
    const isMr = modality.includes('MR');

    let study: ImageStudy = {
      ...info,
      id: `study-${key || studyIdx}`,
      patientName: info.patientName || 'Paciente Radioterapia',
      patientId: info.patientId || 'RT-001',
      studyDescription: info.studyDescription || 'Estudio Radioterapia',
      seriesDescription: (info.seriesDescription || `${sortedSlices.length} Cortes ${modality}`)+(info.acquisitionKey?' · '+info.acquisitionKey:''),
      modality: modality as any,
      slices: sortedSlices,
      colorMap: isPet ? 'hot_iron' : isMr ? 'cyan' : 'grayscale',
      defaultWindowCenter: sortedSlices[Math.floor(sortedSlices.length / 2)]?.windowCenter || 40,
      defaultWindowWidth: sortedSlices[Math.floor(sortedSlices.length / 2)]?.windowWidth || 400
    };

    const native=study;study=await axialForViewer(study,onProgress,signal) as ImageStudy;
    if(study!==native)study.id='study-'+study.seriesInstanceUID;
    studies.push(study);

    // Primary series: prefer CT if available, or first series
    if (!primarySeries || (primarySeries.modality !== 'CT' && modality === 'CT')) {
      primarySeries = {
        sourceVolume: study.sourceVolume,
        resampling: study.resampling,
        acquisitionKey: study.acquisitionKey,
        acquisitionDimensions: study.acquisitionDimensions,
        patientName: study.patientName,
        patientId: study.patientId,
        studyDescription: study.studyDescription,
        seriesDescription: study.seriesDescription,
        modality: study.modality,
        slices: study.slices,
        studyInstanceUID: info.studyInstanceUID,
        seriesInstanceUID: study.seriesInstanceUID,
        frameOfReferenceUID: info.frameOfReferenceUID,
        patientBirthDate: info.patientBirthDate,
        patientSex: info.patientSex,
        studyDate: info.studyDate,
        studyTime: info.studyTime,
        accessionNumber: info.accessionNumber
      };
    }
    studyIdx++;
  }

  const finalSeries = primarySeries || {
    patientName: studies[0]?.patientName || 'Paciente Radioterapia',
    patientId: studies[0]?.patientId || 'RT-001',
    studyDescription: studies[0]?.studyDescription || 'Planificación TAC',
    seriesDescription: studies[0]?.seriesDescription || 'Cortes DICOM',
    modality: studies[0]?.modality || 'CT',
    slices: studies[0]?.slices || [],
    studyInstanceUID: studies[0]?.slices[0]?.sopInstanceUID ? `1.2.826.0.1.3680043.9.7126.1.${Date.now()}` : undefined,
    seriesInstanceUID: studies[0]?.slices[0]?.sopInstanceUID ? `1.2.826.0.1.3680043.9.7126.2.${Date.now()}` : undefined,
    frameOfReferenceUID: `1.2.826.0.1.3680043.9.7126.3.${Date.now()}`
  };

  studies.sort((a,b) => Number(b.slices === finalSeries.slices)-Number(a.slices === finalSeries.slices));
  if (new Set(studies.map(s => s.patientId)).size > 1) throw new Error('Los archivos pertenecen a pacientes distintos. Abra un solo paciente.');
  return Object.assign(finalSeries, { studies });
}

export const nativeSyntaxes=['1.2.840.10008.1.2','1.2.840.10008.1.2.1','1.2.840.10008.1.2.2'];
export const losslessSyntaxes=['1.2.840.10008.1.2.5','1.2.840.10008.1.2.4.70','1.2.840.10008.1.2.4.80','1.2.840.10008.1.2.4.90','1.2.840.10008.1.2.4.201','1.2.840.10008.1.2.4.202'];
export const compressedSyntaxes=[...losslessSyntaxes,'1.2.840.10008.1.2.4.50','1.2.840.10008.1.2.4.81','1.2.840.10008.1.2.4.91','1.2.840.10008.1.2.4.203'];
export async function parseDicomImage(bytes:Uint8Array,name:string){
 const ds=readDicomDataset(bytes,{untilTag:'x7fe00010'}),syntax=transferSyntax(ds);
 if(nativeSyntaxes.includes(syntax))return parseDicomByteArray(bytes,name);
 if(!compressedSyntaxes.includes(syntax))throw new Error(name+': unsupported DICOM transfer syntax '+syntax);
 const parsed=parseDicomByteArray(await decodeCompressedDicom(bytes),name);
 parsed.slice.sourceTransferSyntax=syntax;parsed.slice.sourceCompressed=true;
 parsed.slice.sourceLossy=ds.string('x00282110')==='01' || !losslessSyntaxes.includes(syntax);
 return parsed;
}
export async function parseDicomFrames(bytes:Uint8Array,name:string,selectedKeys?:Set<string>,signal?:AbortSignal){
 const original=readDicomDataset(bytes,{untilTag:'x7fe00010'}),syntax=transferSyntax(original);
 if(!nativeSyntaxes.includes(syntax) && !compressedSyntaxes.includes(syntax))throw new Error(name+': unsupported DICOM transfer syntax '+syntax);
 const decoded=nativeSyntaxes.includes(syntax)?bytes:await decodeCompressedDicom(bytes),ds=readDicomDataset(decoded),count=ds.intString('x00280008') || 1;
 if(!Number.isInteger(count) || count<1 || count>100000)throw new Error('Invalid DICOM frame count.');
 const results=[];
 for(let index=0;index<count;index++){
  signal?.throwIfAborted();
  const view=frameDataset(ds,index),key=dicomText(ds,'x00100020')+'|'+ds.string('x0020000e');
  if(selectedKeys && !selectedKeys.has(key) && !selectedKeys.has(key+'|'+acquisitionToken(view)))continue;
  const parsed=parseDicomByteArray(decoded,name,{dataSet:view,index});
  parsed.slice.sourceTransferSyntax=syntax;parsed.slice.sourceCompressed=!nativeSyntaxes.includes(syntax);parsed.slice.sourceLossy=original.string('x00282110')==='01' || (parsed.slice.sourceCompressed && !losslessSyntaxes.includes(syntax));results.push(parsed);
  if(index%16===15)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return results;
}
export interface ImportSeries {
 enhanced?:boolean;frames?:number;
 raw?:boolean;acquisitionKey?:string;seriesUID?:string;
 key:string;patientId:string;patientName:string;description:string;modality:string;files:File[];
 compressed:boolean;lossy:boolean;syntaxes:string[];unsupported:boolean;
}
export async function inspectDicomFiles(files:File[],onProgress?:(text:string)=>void):Promise<ImportSeries[]>{
 const groups=new Map<string,ImportSeries>();
 const fileMeta=new Map<File,{position:string;acquisition:string;dimensions:boolean}>();
 const inspect=async(file:File)=>{
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!isLikelyDicom(bytes,file.name))return;
  const ds=readDicomDataset(bytes,{untilTag:'x7fe00010'});
  if(!ds.uint16('x00280010') || !ds.uint16('x00280011'))return; // RTSTRUCT, DICOMDIR, reports are not image series.
  const uid=ds.string('x0020000e');if(!uid)throw new Error(file.name+': missing Series Instance UID');
  const patientId=dicomText(ds,'x00100020'),key=patientId+'|'+uid,syntax=transferSyntax(ds);
  if((ds.intString('x00280008') || 1)>1 || ds.elements.x52009230){
   const count=ds.intString('x00280008') || 1;
   for(let index=0;index<count;index++){
    const view=frameDataset(ds,index),token=acquisitionToken(view),frameKey=key+(token?'|'+token:'');
    let g=groups.get(frameKey);
    if(!g){g={key:frameKey,patientId,patientName:cleanPatientName(dicomText(ds,'x00100010')),description:(dicomText(ds,'x0008103e') || uid)+(token?' · '+token:''),modality:ds.string('x00080060') || '',files:[],compressed:!nativeSyntaxes.includes(syntax),lossy:ds.string('x00282110')==='01' || (!nativeSyntaxes.includes(syntax) && !losslessSyntaxes.includes(syntax)),syntaxes:[syntax],unsupported:![...nativeSyntaxes,...compressedSyntaxes].includes(syntax) || !['MONOCHROME1','MONOCHROME2'].includes(ds.string('x00280004') || ''),seriesUID:uid,acquisitionKey:token || undefined,enhanced:true,frames:0};groups.set(frameKey,g);}
    if(!g.files.includes(file))g.files.push(file);g.frames!++;
   }
   return;
  }
  let group=groups.get(key);
  if(!group){group={key,patientId,patientName:cleanPatientName(dicomText(ds,'x00100010')),description:dicomText(ds,'x0008103e') || uid,modality:ds.string('x00080060') || '',files:[],compressed:false,lossy:false,syntaxes:[],unsupported:false};groups.set(key,group);}
  fileMeta.set(file,{position:ds.string('x00200032') || '',acquisition:acquisitionToken(ds),dimensions:acquisitionDimensions(ds).length>0});
  group.raw ||= !!ds.ivcsRaw;group.seriesUID=uid;
  group.files.push(file);group.compressed ||= !nativeSyntaxes.includes(syntax);
  group.lossy ||= ds.string('x00282110')==='01' || (!nativeSyntaxes.includes(syntax) && !losslessSyntaxes.includes(syntax));
  group.unsupported ||= ![...nativeSyntaxes,...compressedSyntaxes].includes(syntax) || (ds.intString('x00280008') || 1)!==1 || !['MONOCHROME1','MONOCHROME2'].includes(ds.string('x00280004') || '');
  if(!group.syntaxes.includes(syntax))group.syntaxes.push(syntax);
 };
 for(const file of files){
  onProgress?.(file.name);
  if(file.name.toLowerCase().endsWith('.zip') || /zip/.test(file.type)){
   const zip=await JSZip.loadAsync(await file.arrayBuffer());
   for(const entry of Object.values(zip.files))if(!entry.dir && !entry.name.startsWith('__MACOSX/') && !entry.name.split('/').some(p=>p.startsWith('.'))){
    await inspect(new File([await entry.async('arraybuffer')],entry.name.split('/').pop() || 'image.dcm'));
   }
  }else await inspect(file);
 }
 if(!groups.size)throw new Error('No DICOM image series found.');
 const result:ImportSeries[]=[];
 for(const group of groups.values()){
  if(group.enhanced){result.push(group);continue;}
  const positions=group.files.map(f=>fileMeta.get(f)!.position);
  const dimensions=group.files.filter(f=>fileMeta.get(f)!.dimensions).map(f=>fileMeta.get(f)!.acquisition);
  if(new Set(positions).size===positions.length && new Set(dimensions).size<=1){result.push(group);continue;}
  const acquisitions=new Map<string,File[]>();
  for(const file of group.files){const token=fileMeta.get(file)!.acquisition;if(!token)throw new Error('Posiciones repetidas sin identificador de adquisición; no se mezclaron imágenes.');const list=acquisitions.get(token)||[];list.push(file);acquisitions.set(token,list);}
  for(const [token,list] of acquisitions)result.push({...group,key:group.key+'|'+token,acquisitionKey:token,description:group.description+' · '+token,files:list});
 }
 return result.sort((a,b)=>a.seriesUID===b.seriesUID?(a.acquisitionKey || '').localeCompare(b.acquisitionKey || '',undefined,{numeric:true}):0);
}

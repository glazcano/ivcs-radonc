import { DicomSeries, ImageStudy, StructureRoi, RegistrationState } from '../types';
import {acquisitionGeometry} from './volumeSampling';
import { validateVolume } from './geometry';
import { libraryIndex, openLibraryStudy, saveLibrarySession } from './libraryClient';

export interface Session {
  format: 'radcontour-session';
  version: 1;
  series: DicomSeries;
  studies: ImageStudy[];
  rois: StructureRoi[];
  currentSliceIndex: number;
  activeRoiId: string | null;
  windowCenter: number;
  windowWidth: number;
  registrationState: RegistrationState;
}

export function serializeSession(session: Session): string {
  const loaded=new Set(session.studies.map(s=>s.id));
  const portable={...session,registrationState:{...session.registrationState,secondaryStudyId:loaded.has(session.registrationState.secondaryStudyId)?session.registrationState.secondaryStudyId:session.registrationState.referenceStudyId,transforms:Object.fromEntries(Object.entries(session.registrationState.transforms).filter(([id])=>loaded.has(id)))}};
  return JSON.stringify(portable, (_, value) => value instanceof Int16Array || value instanceof Float32Array || value instanceof Uint8Array ? Array.from(value) : value);
}

export function parseSession(text: string): Session {
  const s = JSON.parse(text);
  if (s?.format !== 'radcontour-session' || s.version !== 1 || !Array.isArray(s.rois) || !Array.isArray(s.studies)) throw new Error('No es una sesión IVCS RT compatible. Los reportes JSON antiguos no contienen contornos.');
  const restoreSlices = (series: DicomSeries,original=false) => {
    if (!series || !Array.isArray(series.slices)) throw new Error('Sesión sin imágenes.');
    series.slices.forEach((slice,i) => {
      if (!Number.isInteger(slice.rows) || !Number.isInteger(slice.cols) || slice.rows <= 0 || slice.cols <= 0 || slice.sliceIndex !== i || !Array.isArray(slice.huData) || slice.huData.length !== slice.rows*slice.cols || !slice.huData.every(v=>slice.pixelType==='f32'?Number.isFinite(v) && Number.isFinite(Math.fround(v)):Number.isInteger(v) && v >= -32768 && v <= 32767)) throw new Error('Imágenes inválidas en la sesión.');
      slice.huData = slice.pixelType==='f32'?new Float32Array(slice.huData):new Int16Array(slice.huData);
      if(slice.valid){if(!Array.isArray(slice.valid) || slice.valid.length!==slice.rows*slice.cols || !slice.valid.every(v=>v===0 || v===1))throw new Error('Máscara de adquisición inválida.');slice.valid=new Uint8Array(slice.valid);}
    });
    if(original)acquisitionGeometry(series.slices,true);else validateVolume(series.slices);
    if(series.sourceVolume){if(original || series.sourceVolume.patientId!==series.patientId || series.sourceVolume.frameOfReferenceUID!==series.frameOfReferenceUID || series.sourceVolume.seriesInstanceUID===series.seriesInstanceUID)throw new Error('Referencia de reconstrucción inválida.');restoreSlices(series.sourceVolume,true);}
  };
  restoreSlices(s.series);
  s.studies.forEach(study=>restoreSlices(study));
  if (!s.studies.length || s.studies.some(study=>study.patientId !== s.series.patientId)) throw new Error('Estudios de sesión inconsistentes.');
  const ids = new Set();
  for (const roi of s.rois) {
    if (!roi || typeof roi.id !== 'string' || ids.has(roi.id) || typeof roi.name !== 'string' || !['GTV','CTV','PTV','OAR','EXTERNAL','PRV','SUPPORT','AVOIDANCE'].includes(roi.type) || !/^#[0-9a-f]{6}$/i.test(roi.color) || typeof roi.visible !== 'boolean' || typeof roi.locked !== 'boolean' || !Number.isFinite(roi.opacity) || roi.opacity < 0 || roi.opacity > 1 || !roi.sliceMasks || typeof roi.sliceMasks !== 'object') throw new Error('Estructura inválida en la sesión.');
    ids.add(roi.id);
    for (const [key,mask] of Object.entries(roi.sliceMasks)) {
      const slice = s.series.slices[Number(key)];
      if (!/^\d+$/.test(key) || !slice || !Array.isArray(mask) || mask.length !== slice.rows*slice.cols || !mask.every(v=>v===0 || v===1)) throw new Error('Máscara inválida en la sesión.');
      roi.sliceMasks[key] = new Uint8Array(mask);
    }
  }
  if (!Number.isInteger(s.currentSliceIndex) || !s.series.slices[s.currentSliceIndex] || !Number.isFinite(s.windowCenter) || !Number.isFinite(s.windowWidth) || s.windowWidth <= 0 || (s.activeRoiId !== null && !ids.has(s.activeRoiId))) throw new Error('Ajustes de sesión inválidos.');
  const r = s.registrationState;
  if (!r || !s.studies.some(study=>study.id===r.referenceStudyId) || !s.studies.some(study=>study.id===r.secondaryStudyId) || !r.voi || !r.transforms) throw new Error('Referencias de fusión inválidas.');
  if(r.detachedSeriesIds && (!Array.isArray(r.detachedSeriesIds) || r.detachedSeriesIds.some(id=>typeof id!=='string')))throw new Error('Vínculos de series inválidos.');
  if(r.relationPolicies && (typeof r.relationPolicies!=='object' || Object.values(r.relationPolicies).some(v=>!['preserve','dicom','saved','single'].includes(String(v)))))throw new Error('Vínculos de series inválidos.');
  const reference = s.studies.find(study=>study.id===r.referenceStudyId);
  if (reference.slices.length !== s.series.slices.length || reference.slices.some((slice,i)=>slice.id !== s.series.slices[i].id)) throw new Error('La referencia de fusión no coincide con la imagen principal.');
  if (!['blend','checkerboard','split_horizontal','split_vertical','difference'].includes(r.fusionMode) || !['hot_iron','rainbow','cyan','grayscale'].includes(r.secondaryColorMap) || ![r.fusionOpacity,r.checkerboardSize,r.splitPosition,r.secondaryWindowCenter,r.secondaryWindowWidth].every(Number.isFinite) || r.secondaryWindowWidth <= 0 || r.checkerboardSize <= 0) throw new Error('Ajustes de fusión inválidos.');
  for (const transform of Object.values(r.transforms) as any[]) {
    if(transform?.model==='rigid3d' && (![transform.rotationX,transform.rotationY,...(transform.center || [])].every(Number.isFinite) || transform.center?.length!==3 || transform.scaleX!==1 || transform.scaleY!==1))throw new Error('Transformación rígida 3D inválida.');
    if (!transform || ![transform.translationX,transform.translationY,transform.translationZ,transform.rotationDeg,transform.scaleX,transform.scaleY].every(Number.isFinite) || transform.scaleX <= 0 || transform.scaleY <= 0) throw new Error('Transformación de fusión inválida.');
  }
  // Reconfirm registration after importing a portable session.
  r.active = false;
  return s as Session;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('radcontour',1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLegacySession(session: Session): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve,reject) => {
      const tx = db.transaction('sessions','readwrite');
      tx.objectStore('sessions').put(session,'latest');
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo guardar.'));
    });
  } finally { db.close(); }
}

export async function loadLegacySession(): Promise<Session | undefined> {
  const db = await database();
  try {
    return await new Promise<Session | undefined>((resolve,reject)=> {
      const req = db.transaction('sessions').objectStore('sessions').get('latest');
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  } finally { db.close(); }
}

export const saveSession = saveLibrarySession;
export async function loadSession(): Promise<Session | undefined> {
  const index=await libraryIndex();
  if(index.latest)return openLibraryStudy(index.latest);
  if(index.exists)return undefined;
  const legacy=await loadLegacySession();
  if(legacy)await saveLibrarySession(legacy);
  return legacy;
}

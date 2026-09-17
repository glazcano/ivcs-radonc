import { DicomSlice } from '../types';

export function patientPoint(slice: DicomSlice, col: number, row: number): [number, number, number] {
  const p = slice.imagePositionPatient || [0, 0, slice.sliceLocation];
  const o = slice.imageOrientationPatient || [1, 0, 0, 0, 1, 0];
  return [0, 1, 2].map(i => p[i] + col * slice.pixelSpacing[1] * o[i] + row * slice.pixelSpacing[0] * o[i + 3]) as [number, number, number];
}

export function sliceDistance(slice: DicomSlice): number {
  const o = slice.imageOrientationPatient || [1, 0, 0, 0, 1, 0];
  const p = slice.imagePositionPatient || [0, 0, slice.sliceLocation];
  return p[0] * (o[1]*o[5]-o[2]*o[4]) + p[1] * (o[2]*o[3]-o[0]*o[5]) + p[2] * (o[0]*o[4]-o[1]*o[3]);
}

export function voxelDepth(slices: DicomSlice[], slice: DicomSlice): number {
  return slices.length > 1 ? Math.abs(sliceDistance(slices[1])-sliceDistance(slices[0])) : slice.sliceThickness;
}

// The current drawing, anatomical margins and fusion engines require this grid.
// Reject unsupported grids instead of displaying misleading anatomical labels.
export function validateVolume(slices: DicomSlice[]): void {
  if (!slices.length) throw new Error('La serie no contiene imágenes.');
  const first = slices[0];
  const axial = [1, 0, 0, 0, 1, 0];
  for (const s of slices) {
    if (!s.imagePositionPatient?.every(Number.isFinite) || !s.imageOrientationPatient?.every(Number.isFinite)) throw new Error('Faltan posición u orientación DICOM válidas.');
    if (s.imageOrientationPatient.some((v, i) => Math.abs(v - axial[i]) > 0.0001)) throw new Error('Adquisición oblicua o no axial: requiere remuestreo antes de abrirla en este visor.');
    if (s.rows !== first.rows || s.cols !== first.cols || s.pixelSpacing.some((v, i) => !Number.isFinite(v) || v <= 0 || Math.abs(v-first.pixelSpacing[i]) > 0.0001)) throw new Error('La serie tiene dimensiones o espaciado inconsistentes.');
    if (Math.abs(s.imagePositionPatient[0]-first.imagePositionPatient[0]) > 0.01 || Math.abs(s.imagePositionPatient[1]-first.imagePositionPatient[1]) > 0.01) throw new Error('La serie requiere corregir el desplazamiento entre cortes.');
  }
  if (slices.length > 1) {
    const spacing = sliceDistance(slices[1])-sliceDistance(first);
    if (spacing <= 0.001 || slices.slice(1).some((s,i) => Math.abs(sliceDistance(s)-sliceDistance(slices[i])-spacing) > Math.max(0.01, spacing*0.01))) throw new Error('Cortes duplicados, faltantes o espaciado irregular: la serie requiere remuestreo.');
  }
}

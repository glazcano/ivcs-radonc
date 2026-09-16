import { patientPoint } from './geometry';
import { DicomSeries, DicomSlice, StructureRoi, MprPlane, MprCoordinates } from '../types';

export interface VolumeGeometry {
  cols: number;
  rows: number;
  numSlices: number;
  pixelSpacingX: number; // mm
  pixelSpacingY: number; // mm
  sliceSpacingZ: number; // mm
  isZAscending: boolean;
  axialWidthMm: number;
  axialHeightMm: number;
  coronalWidthMm: number;
  coronalHeightMm: number;
  sagittalWidthMm: number;
  sagittalHeightMm: number;
  coronalAspect: number; // HeightMm / WidthMm
  sagittalAspect: number; // HeightMm / WidthMm
}

/**
 * Calculates the 3D volume geometry, voxel spacings, and aspect ratios
 */
export function getVolumeGeometry(series: DicomSeries | null): VolumeGeometry {
  if (!series || !series.slices || series.slices.length === 0) {
    return {
      cols: 512,
      rows: 512,
      numSlices: 1,
      pixelSpacingX: 1.0,
      pixelSpacingY: 1.0,
      sliceSpacingZ: 2.5,
      isZAscending: true,
      axialWidthMm: 512,
      axialHeightMm: 512,
      coronalWidthMm: 512,
      coronalHeightMm: 2.5,
      sagittalWidthMm: 512,
      sagittalHeightMm: 2.5,
      coronalAspect: 2.5 / 512,
      sagittalAspect: 2.5 / 512
    };
  }

  const s0 = series.slices[0];
  const cols = s0.cols || 512;
  const rows = s0.rows || 512;
  const numSlices = series.slices.length;
  const pixelSpacingY = s0.pixelSpacing?.[0] || 1.0;
  const pixelSpacingX = s0.pixelSpacing?.[1] || pixelSpacingY || 1.0;

  let sliceSpacingZ = s0.sliceThickness || 2.5;
  let isZAscending = true;

  if (numSlices > 1) {
    const sLast = series.slices[numSlices - 1];
    const loc0 = s0.sliceLocation;
    const locLast = sLast.sliceLocation;
    isZAscending = locLast >= loc0;
    const avgSpacing = Math.abs(locLast - loc0) / (numSlices - 1);
    if (avgSpacing > 0.05 && !isNaN(avgSpacing)) {
      sliceSpacingZ = avgSpacing;
    }
  }

  const axialWidthMm = cols * pixelSpacingX;
  const axialHeightMm = rows * pixelSpacingY;
  const coronalWidthMm = cols * pixelSpacingX;
  const coronalHeightMm = numSlices * sliceSpacingZ;
  const sagittalWidthMm = rows * pixelSpacingY;
  const sagittalHeightMm = numSlices * sliceSpacingZ;

  const coronalAspect = coronalHeightMm / (coronalWidthMm || 1);
  const sagittalAspect = sagittalHeightMm / (sagittalWidthMm || 1);

  return {
    cols,
    rows,
    numSlices,
    pixelSpacingX,
    pixelSpacingY,
    sliceSpacingZ,
    isZAscending,
    axialWidthMm,
    axialHeightMm,
    coronalWidthMm,
    coronalHeightMm,
    sagittalWidthMm,
    sagittalHeightMm,
    coronalAspect,
    sagittalAspect
  };
}

/**
 * Maps screen vertical index v (0..numSlices-1, top to bottom) to slice index z
 * Ensures that top of screen is Superior (cranial)
 */
export function vToZIndex(v: number, numSlices: number, isZAscending: boolean): number {
  const clampedV = Math.max(0, Math.min(numSlices - 1, Math.round(v)));
  return isZAscending ? (numSlices - 1 - clampedV) : clampedV;
}

/**
 * Maps slice index z (0..numSlices-1) to screen vertical coordinate v
 */
export function zToVIndex(z: number, numSlices: number, isZAscending: boolean): number {
  const clampedZ = Math.max(0, Math.min(numSlices - 1, Math.round(z)));
  return isZAscending ? (numSlices - 1 - clampedZ) : clampedZ;
}

/**
 * Pre-computes a fast lookup table for Window Center / Window Width
 */
export function createHuLut(windowCenter: number, windowWidth: number): Uint8Array {
  const lut = new Uint8Array(65536);
  const ww = Math.max(1, windowWidth);
  const halfWw = ww / 2;
  const minHu = windowCenter - halfWw;

  // HU range: -32768 to 32767. Offset index by +32768
  for (let i = 0; i < 65536; i++) {
    const hu = i - 32768;
    if (hu <= minHu) {
      lut[i] = 0;
    } else if (hu >= windowCenter + halfWw) {
      lut[i] = 255;
    } else {
      lut[i] = Math.round(((hu - minHu) / ww) * 255);
    }
  }

  return lut;
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return [59, 130, 246]; // default blue
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export interface RenderMprSliceOptions {
  windowCenter: number;
  windowWidth: number;
  rois?: StructureRoi[];
  showRois?: boolean;
  activeRoiId?: string | null;
  lut?: Uint8Array;
}

/**
 * Reslices and renders a Coronal slice (at row Y) onto an OffscreenCanvas
 */
export function renderCoronalSliceToCanvas(
  series: DicomSeries,
  coronalY: number,
  options: RenderMprSliceOptions
): HTMLCanvasElement {
  const geo = getVolumeGeometry(series);
  const { cols, numSlices, isZAscending } = geo;
  const clampedY = Math.max(0, Math.min(geo.rows - 1, Math.round(coronalY)));

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = numSlices;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(cols, numSlices);
  const data32 = new Uint32Array(imgData.data.buffer);

  const lut = options.lut || createHuLut(options.windowCenter, options.windowWidth);

  // Pre-filter visible ROIs
  const visibleRois = (options.showRois !== false && options.rois) 
    ? options.rois.filter(r => r.visible && r.sliceMasks)
    : [];

  const parsedRois = visibleRois.map(r => ({
    roi: r,
    rgb: hexToRgb(r.color),
    opacity: r.opacity !== undefined ? r.opacity : 0.35,
    borderAlpha: 0.95
  }));

  // Build Coronal 2D pixels
  for (let v = 0; v < numSlices; v++) {
    const z = vToZIndex(v, numSlices, isZAscending);
    const slice = series.slices[z];
    if (!slice || !slice.huData) continue;

    const huData = slice.huData;
    const rowOffset = clampedY * cols;
    const vOffset = v * cols;

    for (let x = 0; x < cols; x++) {
      const hu = huData[rowOffset + x];
      // Lookup mapped grayscale intensity
      const lutIdx = Math.max(0, Math.min(65535, hu + 32768));
      const gray = lut[lutIdx];

      let rOut = gray;
      let gOut = gray;
      let bOut = gray;

      // Overlay ROIs
      if (parsedRois.length > 0) {
        for (let i = 0; i < parsedRois.length; i++) {
          const { roi, rgb, opacity } = parsedRois[i];
          const mask = roi.sliceMasks[z];
          if (!mask) continue;

          const maskVal = mask[rowOffset + x];
          if (maskVal === 1) {
            // Check if boundary pixel in Coronal view (neighbor above/below or left/right is not mask)
            let isBorder = false;
            if (x === 0 || x === cols - 1 || v === 0 || v === numSlices - 1) {
              isBorder = true;
            } else {
              // Left / Right neighbor
              if (mask[rowOffset + x - 1] === 0 || mask[rowOffset + x + 1] === 0) {
                isBorder = true;
              } else {
                // Top / Bottom neighbor in Z
                const zAbove = vToZIndex(v - 1, numSlices, isZAscending);
                const zBelow = vToZIndex(v + 1, numSlices, isZAscending);
                const maskAbove = roi.sliceMasks[zAbove];
                const maskBelow = roi.sliceMasks[zBelow];
                if (!maskAbove || maskAbove[rowOffset + x] === 0 || !maskBelow || maskBelow[rowOffset + x] === 0) {
                  isBorder = true;
                }
              }
            }

            const blendAlpha = isBorder ? 0.92 : opacity;
            rOut = Math.round(rOut * (1 - blendAlpha) + rgb[0] * blendAlpha);
            gOut = Math.round(gOut * (1 - blendAlpha) + rgb[1] * blendAlpha);
            bOut = Math.round(bOut * (1 - blendAlpha) + rgb[2] * blendAlpha);
          }
        }
      }

      data32[vOffset + x] = 0xFF000000 | (bOut << 16) | (gOut << 8) | rOut;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Reslices and renders a Sagittal slice (at col X) onto an OffscreenCanvas
 */
export function renderSagittalSliceToCanvas(
  series: DicomSeries,
  sagittalX: number,
  options: RenderMprSliceOptions
): HTMLCanvasElement {
  const geo = getVolumeGeometry(series);
  const { cols, rows, numSlices, isZAscending } = geo;
  const clampedX = Math.max(0, Math.min(cols - 1, Math.round(sagittalX)));

  const canvas = document.createElement('canvas');
  canvas.width = rows;
  canvas.height = numSlices;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(rows, numSlices);
  const data32 = new Uint32Array(imgData.data.buffer);

  const lut = options.lut || createHuLut(options.windowCenter, options.windowWidth);

  // Pre-filter visible ROIs
  const visibleRois = (options.showRois !== false && options.rois) 
    ? options.rois.filter(r => r.visible && r.sliceMasks)
    : [];

  const parsedRois = visibleRois.map(r => ({
    roi: r,
    rgb: hexToRgb(r.color),
    opacity: r.opacity !== undefined ? r.opacity : 0.35
  }));

  // Build Sagittal 2D pixels (horizontal: Y 0..rows-1 Anterior->Posterior, vertical: Z Superior->Inferior)
  for (let v = 0; v < numSlices; v++) {
    const z = vToZIndex(v, numSlices, isZAscending);
    const slice = series.slices[z];
    if (!slice || !slice.huData) continue;

    const huData = slice.huData;
    const vOffset = v * rows;

    for (let y = 0; y < rows; y++) {
      const hu = huData[y * cols + clampedX];
      const lutIdx = Math.max(0, Math.min(65535, hu + 32768));
      const gray = lut[lutIdx];

      let rOut = gray;
      let gOut = gray;
      let bOut = gray;

      // Overlay ROIs
      if (parsedRois.length > 0) {
        for (let i = 0; i < parsedRois.length; i++) {
          const { roi, rgb, opacity } = parsedRois[i];
          const mask = roi.sliceMasks[z];
          if (!mask) continue;

          const maskVal = mask[y * cols + clampedX];
          if (maskVal === 1) {
            let isBorder = false;
            if (y === 0 || y === rows - 1 || v === 0 || v === numSlices - 1) {
              isBorder = true;
            } else {
              // Left / Right neighbor in Y
              if (mask[(y - 1) * cols + clampedX] === 0 || mask[(y + 1) * cols + clampedX] === 0) {
                isBorder = true;
              } else {
                // Top / Bottom neighbor in Z
                const zAbove = vToZIndex(v - 1, numSlices, isZAscending);
                const zBelow = vToZIndex(v + 1, numSlices, isZAscending);
                const maskAbove = roi.sliceMasks[zAbove];
                const maskBelow = roi.sliceMasks[zBelow];
                if (!maskAbove || maskAbove[y * cols + clampedX] === 0 || !maskBelow || maskBelow[y * cols + clampedX] === 0) {
                  isBorder = true;
                }
              }
            }

            const blendAlpha = isBorder ? 0.92 : opacity;
            rOut = Math.round(rOut * (1 - blendAlpha) + rgb[0] * blendAlpha);
            gOut = Math.round(gOut * (1 - blendAlpha) + rgb[1] * blendAlpha);
            bOut = Math.round(bOut * (1 - blendAlpha) + rgb[2] * blendAlpha);
          }
        }
      }

      data32[vOffset + y] = 0xFF000000 | (bOut << 16) | (gOut << 8) | rOut;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Samples the HU value at 3D voxel coordinate (x, y, z)
 */
export function sampleVoxelHu(
  series: DicomSeries | null,
  x: number,
  y: number,
  z: number
): number | null {
  if (!series || !series.slices || series.slices.length === 0) return null;
  const clampedZ = Math.max(0, Math.min(series.slices.length - 1, Math.round(z)));
  const slice = series.slices[clampedZ];
  if (!slice || !slice.huData) return null;

  const clampedX = Math.max(0, Math.min(slice.cols - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(slice.rows - 1, Math.round(y)));

  const idx = clampedY * slice.cols + clampedX;
  return slice.huData[idx] ?? null;
}

/**
 * Calculates centroid (X, Y, Z) in voxel coordinates of a target StructureRoi
 */
export function calculateRoiCentroid(
  roi: StructureRoi | null,
  cols: number,
  rows: number,
  numSlices: number
): MprCoordinates | null {
  if (!roi || !roi.sliceMasks) return null;

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let count = 0;

  for (let z = 0; z < numSlices; z++) {
    const mask = roi.sliceMasks[z];
    if (!mask) continue;

    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        if (mask[rowOffset + x] === 1) {
          sumX += x;
          sumY += y;
          sumZ += z;
          count++;
        }
      }
    }
  }

  if (count === 0) return null;

  return {
    x: Math.round(sumX / count),
    y: Math.round(sumY / count),
    z: Math.round(sumZ / count)
  };
}

/**
 * Converts voxel indices (X, Y, Z) to physical patient millimeters (relative or DICOM IPP)
 */
export function voxelToPatientCoordinates(
  coords: MprCoordinates,
  series: DicomSeries | null
): { xMm: number; yMm: number; zMm: number } {
  if (!series || !series.slices || series.slices.length === 0) {
    return { xMm: coords.x, yMm: coords.y, zMm: coords.z };
  }

  const slice = series.slices[Math.max(0, Math.min(series.slices.length-1, Math.round(coords.z)))];
  const [xMm,yMm,zMm] = patientPoint(slice,coords.x,coords.y);
  return {xMm,yMm,zMm};
}

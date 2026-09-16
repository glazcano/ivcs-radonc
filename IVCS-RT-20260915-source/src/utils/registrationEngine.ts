import { DicomSlice, RegistrationTransform, RegistrationVoi, FusionMode, RegistrationAlgorithm } from '../types';

/**
 * Precalculated Color LUTs (Look-Up Tables) for Multimodal Radiology Fusion
 */
function generateLuts() {
  const hotIron = new Uint32Array(256);
  const rainbow = new Uint32Array(256);
  const cyan = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;

    // Hot Iron / Hot Metal (standard for PET SUV): Black -> Red -> Orange -> Yellow -> White
    let r = 0, g = 0, b = 0;
    if (t < 0.33) {
      r = Math.round((t / 0.33) * 255);
      g = 0;
      b = 0;
    } else if (t < 0.66) {
      r = 255;
      g = Math.round(((t - 0.33) / 0.33) * 255);
      b = 0;
    } else if (t < 0.90) {
      r = 255;
      g = 255;
      b = Math.round(((t - 0.66) / 0.24) * 255);
    } else {
      r = 255;
      g = 255;
      b = 255;
    }
    // ABGR for canvas 32-bit (little-endian)
    hotIron[i] = (255 << 24) | (b << 16) | (g << 8) | r;

    // Rainbow / Jet
    let rr = 0, gg = 0, bb = 0;
    if (t < 0.25) {
      rr = 0;
      gg = Math.round((t / 0.25) * 255);
      bb = 255;
    } else if (t < 0.5) {
      rr = 0;
      gg = 255;
      bb = Math.round((1 - (t - 0.25) / 0.25) * 255);
    } else if (t < 0.75) {
      rr = Math.round(((t - 0.5) / 0.25) * 255);
      gg = 255;
      bb = 0;
    } else {
      rr = 255;
      gg = Math.round((1 - (t - 0.75) / 0.25) * 255);
      bb = 0;
    }
    rainbow[i] = (255 << 24) | (bb << 16) | (gg << 8) | rr;

    // Cyan (Medical MR fusion overlay)
    const cyR = Math.round(t * 30);
    const cyG = Math.round(t * 220);
    const cyB = Math.round(t * 255);
    cyan[i] = (255 << 24) | (cyB << 16) | (cyG << 8) | cyR;
  }

  return { hotIron, rainbow, cyan };
}

export const LUTS = generateLuts();

/**
 * Creates or updates an offscreen HTMLCanvasElement rendering a secondary slice
 * using its window/level and custom colormap (e.g. PET Hot Iron or MR Cyan).
 */
export function renderSliceToCanvas(
  slice: DicomSlice,
  windowCenter: number,
  windowWidth: number,
  colorMap: 'hot_iron' | 'rainbow' | 'cyan' | 'grayscale',
  targetCanvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const canvas = targetCanvas || document.createElement('canvas');
  if (canvas.width !== slice.cols || canvas.height !== slice.rows) {
    canvas.width = slice.cols;
    canvas.height = slice.rows;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(slice.cols, slice.rows);
  const data32 = new Uint32Array(imgData.data.buffer);
  const huData = slice.huData;
  const len = huData.length;

  const halfWidth = windowWidth / 2;
  const minVal = windowCenter - halfWidth;
  const invWidth = 1.0 / (windowWidth || 1);

  if (colorMap === 'grayscale') {
    for (let i = 0; i < len; i++) {
      let norm = (huData[i] - minVal) * invWidth;
      if (norm < 0) norm = 0;
      else if (norm > 1) norm = 1;
      const gray = (norm * 255) | 0;
      data32[i] = (255 << 24) | (gray << 16) | (gray << 8) | gray;
    }
  } else {
    const lut = colorMap === 'hot_iron' ? LUTS.hotIron : colorMap === 'rainbow' ? LUTS.rainbow : LUTS.cyan;
    for (let i = 0; i < len; i++) {
      let norm = (huData[i] - minVal) * invWidth;
      if (norm < 0) norm = 0;
      else if (norm > 1) norm = 1;
      const byteIdx = (norm * 255) | 0;
      data32[i] = lut[byteIdx];
    }
  }

  const valid=(slice as any).valid as Uint8Array|undefined;
  if(valid)for(let i=0;i<len;i++)if(!valid[i])data32[i]=0;
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}


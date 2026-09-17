import {bodyMargin, smoothBody, detectBodyTableRow, filterBodyComponents, refineBodyContinuity} from './bodyAlgorithms';
import {distanceSquared} from './distance';
import { AsymmetricMargin, BooleanOpType, DicomSeries, DicomSlice, StructureRoi } from '../types';
import { voxelDepth } from './geometry';

/**
 * Creates an empty slice mask of size rows * cols
 */
export function createEmptyMask(rows: number, cols: number): Uint8Array {
  return new Uint8Array(rows * cols);
}

export function connectedThreshold(data:Int16Array,rows:number,cols:number,seed:number,min:number,max:number):Uint8Array{
  const mask=new Uint8Array(rows*cols);if(seed<0 || seed>=mask.length || data[seed]<min || data[seed]>max)return mask;
  const queue=new Int32Array(mask.length);let head=0,tail=0;queue[tail++]=seed;mask[seed]=1;
  while(head<tail){const p=queue[head++],x=p%cols,y=Math.floor(p/cols);for(const n of [x>0?p-1:-1,x+1<cols?p+1:-1,y>0?p-cols:-1,y+1<rows?p+cols:-1])if(n>=0 && !mask[n] && data[n]>=min && data[n]<=max){mask[n]=1;queue[tail++]=n;}}
  return mask;
}

/**
 * Clones a slice mask
 */
export function cloneMask(mask: Uint8Array): Uint8Array {
  const next = new Uint8Array(mask.length);
  next.set(mask);
  return next;
}

/**
 * Ensures a structure has a mask for a given slice
 */
export function getOrCreateSliceMask(roi: StructureRoi, sliceIndex: number, rows: number, cols: number): Uint8Array {
  if (!roi.sliceMasks[sliceIndex]) {
    roi.sliceMasks[sliceIndex] = createEmptyMask(rows, cols);
  }
  return roi.sliceMasks[sliceIndex];
}

/**
 * Applies a circular brush stamp at (cx, cy) with exact pixel-center subpixel alignment
 */
export function stampBrushCircle(
  mask: Uint8Array,
  rows: number,
  cols: number,
  cx: number,
  cy: number,
  radiusPx: number,
  value: 0 | 1,
  huData?: Int16Array,
  huThreshold?: { min: number; max: number },
  aspectY: number = 1
) {
  invalidateMask(mask);
  // A pixel at grid coordinate (c, r) represents the continuous unit area [c, c + 1) x [r, r + 1)
  // with geometric center at (c + 0.5, r + 0.5).
  // A pixel is covered if its center falls within the circle:
  //   (c + 0.5 - cx)^2 + (r + 0.5 - cy)^2 <= radiusPx^2
  const effectiveRadius = Math.max(0.5, radiusPx);
  const r2 = effectiveRadius * effectiveRadius;
  const rMin = Math.max(0, Math.ceil(cy - effectiveRadius * aspectY - 0.5));
  const rMax = Math.min(rows - 1, Math.floor(cy + effectiveRadius * aspectY - 0.5));
  const hasThreshold = Boolean(huData && huThreshold);

  for (let r = rMin; r <= rMax; r++) {
    const dy = ((r + 0.5) - cy) / aspectY;
    const dy2 = dy * dy;
    const remaining = r2 - dy2;
    if (remaining < 0) continue;

    const dxMax = Math.sqrt(remaining);
    const cStart = Math.max(0, Math.ceil(cx - dxMax - 0.5));
    const cEnd = Math.min(cols - 1, Math.floor(cx + dxMax - 0.5));
    if (cStart > cEnd) continue;

    const rowOffset = r * cols;

    if (!hasThreshold) {
      // Ultra-fast path: native TypedArray fill (SIMD / memset equivalent)
      mask.fill(value, rowOffset + cStart, rowOffset + cEnd + 1);
    } else {
      // Threshold constrained path
      for (let c = cStart; c <= cEnd; c++) {
        const idx = rowOffset + c;
        const hu = huData![idx];
        if (hu >= huThreshold!.min && hu <= huThreshold!.max) {
          mask[idx] = value;
        }
      }
    }
  }
}

/**
 * Interpolates circles along line between (x0, y0) and (x1, y1) to prevent gaps
 */
export function strokeBrushLine(
  mask: Uint8Array,
  rows: number,
  cols: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radiusPx: number,
  value: 0 | 1,
  huData?: Int16Array,
  huThreshold?: { min: number; max: number },
  aspectY: number = 1
) {
  const dist = Math.hypot(x1 - x0, (y1 - y0) / aspectY);
  const effectiveRadius = Math.max(0.5, radiusPx);
  const step = Math.max(0.35, effectiveRadius * 0.25);
  const steps = Math.ceil(dist / step);

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    stampBrushCircle(mask, rows, cols, x, y, effectiveRadius, value, huData, huThreshold, aspectY);
  }
}

/**
 * Strokes a polyline path onto the mask without filling the interior (Open Contour)
 */
export function strokePathOnMask(
  mask: Uint8Array,
  rows: number,
  cols: number,
  points: Array<[number, number]>,
  radiusPx: number = 1,
  value: 0 | 1 = 1,
  huData?: Int16Array,
  huThreshold?: { min: number; max: number },
  aspectY: number = 1
) {
  if (points.length === 0) return;
  if (points.length === 1) {
    stampBrushCircle(mask, rows, cols, points[0][0], points[0][1], radiusPx, value, huData, huThreshold, aspectY);
    return;
  }
  for (let i = 0; i < points.length - 1; i++) {
    strokeBrushLine(
      mask,
      rows,
      cols,
      points[i][0],
      points[i][1],
      points[i + 1][0],
      points[i + 1][1],
      radiusPx,
      value,
      huData,
      huThreshold, aspectY
    );
  }
}

/**
 * Detects and fills all interior cavities/holes completely enclosed by a contour mask (Closed Contour Fill).
 * Uses a boundary flood-fill (BFS) from the outer image borders to identify external background,
 * then marks all unreachable 0-pixels as 1.
 */
/**
 * Reusable scratch buffer pool for high-performance mask operations across multi-slice series.
 * Eliminates garbage-collection churn (allocates once instead of allocating hundreds of megabytes).
 */
class ContourScratchBufferPool {
  private queue: Int32Array | null = null;
  private visited: Uint8Array | null = null;
  private virtualVisited: Uint8Array | null = null;
  private virtualQueue: Int32Array | null = null;

  getQueue(size: number): Int32Array {
    const targetSize = Math.max(size + 1024, 262144 + 4096);
    if (!this.queue || this.queue.length < targetSize) {
      this.queue = new Int32Array(targetSize);
    }
    return this.queue;
  }

  getVisited(size: number): Uint8Array {
    const targetSize = Math.max(size + 1024, 262144 + 4096);
    if (!this.visited || this.visited.length < targetSize) {
      this.visited = new Uint8Array(targetSize);
    }
    this.visited.fill(0, 0, size);
    return this.visited;
  }

  getVirtualBuffers(vSize: number): { vVisited: Uint8Array; vQueue: Int32Array } {
    const targetSize = Math.max(vSize + 2048, 275000);
    if (!this.virtualVisited || this.virtualVisited.length < targetSize) {
      this.virtualVisited = new Uint8Array(targetSize);
    }
    if (!this.virtualQueue || this.virtualQueue.length < targetSize) {
      this.virtualQueue = new Int32Array(targetSize);
    }
    this.virtualVisited.fill(0, 0, vSize);
    return { vVisited: this.virtualVisited, vQueue: this.virtualQueue };
  }
}

export const contourScratchPool = new ContourScratchBufferPool();

/**
 * Fast 3x3 morphological regularization / majority filter for skin perimeter.
 * Eliminates 1-pixel noisy spikes sticking into air and fills 1-pixel crevices,
 * yielding a smooth, continuous clinical skin contour without altering anatomy.
 */
export function regularizeSkinContour(
  mask: Uint8Array,
  rows: number,
  cols: number
): Uint8Array {
  const result = cloneMask(mask);
  for (let r = 1; r < rows - 1; r++) {
    const rOffset = r * cols;
    for (let c = 1; c < cols - 1; c++) {
      const idx = rOffset + c;
      const current = mask[idx];

      const neighbors = (
        mask[idx - cols - 1] + mask[idx - cols] + mask[idx - cols + 1] +
        mask[idx - 1] + mask[idx + 1] +
        mask[idx + cols - 1] + mask[idx + cols] + mask[idx + cols + 1]
      );

      // If foreground voxel has <= 2 neighbors, it's an isolated noise spike in air -> remove
      if (current === 1 && neighbors <= 2) {
        result[idx] = 0;
      }
      // If background voxel has >= 6 neighbors, it's a tiny single-pixel skin crevice -> fill
      else if (current === 0 && neighbors >= 6) {
        result[idx] = 1;
      }
    }
  }
  return result;
}

/**
 * Robust hole-filling algorithm for internal anatomical cavities (lungs, trachea, bowel, stomach).
 * Uses an expanded virtual 1-pixel border so that exterior ambient air can freely flow around the
 * patient perimeter even if the patient contour touches one or more boundaries of the CT matrix.
 * This completely prevents accidental solid-blackout / full-slice filling artifacts.
 */
export function fillEnclosedHolesOnMask(
  mask: Uint8Array,
  rows: number,
  cols: number
): Uint8Array {
  const totalPixels = rows * cols;
  const result = cloneMask(mask);

  const vCols = cols + 2;
  const vRows = rows + 2;
  const vTotal = vCols * vRows;

  const { vVisited, vQueue } = contourScratchPool.getVirtualBuffers(vTotal);

  let head = 0;
  let tail = 0;

  // Seed BFS from the virtual top-left border (0, 0), which is guaranteed to be external air
  vVisited[0] = 1;
  vQueue[tail++] = 0;

  while (head < tail) {
    const curr = vQueue[head++];
    const vr = (curr / vCols) | 0;
    const vc = curr % vCols;

    // Up
    if (vr > 0) {
      const up = curr - vCols;
      if (vVisited[up] === 0) {
        const nr = vr - 1;
        const nc = vc;
        // In virtual border: always empty air; inside real image: check if mask is 0
        const isAir = (nr === 0 || nr === vRows - 1 || nc === 0 || nc === vCols - 1)
          ? true
          : (mask[(nr - 1) * cols + (nc - 1)] === 0);
        if (isAir) {
          vVisited[up] = 1;
          vQueue[tail++] = up;
        }
      }
    }

    // Down
    if (vr < vRows - 1) {
      const down = curr + vCols;
      if (vVisited[down] === 0) {
        const nr = vr + 1;
        const nc = vc;
        const isAir = (nr === 0 || nr === vRows - 1 || nc === 0 || nc === vCols - 1)
          ? true
          : (mask[(nr - 1) * cols + (nc - 1)] === 0);
        if (isAir) {
          vVisited[down] = 1;
          vQueue[tail++] = down;
        }
      }
    }

    // Left
    if (vc > 0) {
      const left = curr - 1;
      if (vVisited[left] === 0) {
        const nr = vr;
        const nc = vc - 1;
        const isAir = (nr === 0 || nr === vRows - 1 || nc === 0 || nc === vCols - 1)
          ? true
          : (mask[(nr - 1) * cols + (nc - 1)] === 0);
        if (isAir) {
          vVisited[left] = 1;
          vQueue[tail++] = left;
        }
      }
    }

    // Right
    if (vc < vCols - 1) {
      const right = curr + 1;
      if (vVisited[right] === 0) {
        const nr = vr;
        const nc = vc + 1;
        const isAir = (nr === 0 || nr === vRows - 1 || nc === 0 || nc === vCols - 1)
          ? true
          : (mask[(nr - 1) * cols + (nc - 1)] === 0);
        if (isAir) {
          vVisited[right] = 1;
          vQueue[tail++] = right;
        }
      }
    }
  }

  // Any pixel in the real slice that was 0 and was NOT reached by exterior air is an enclosed internal organ hole
  for (let r = 0; r < rows; r++) {
    const rOffset = r * cols;
    const vOffset = (r + 1) * vCols + 1;
    for (let c = 0; c < cols; c++) {
      const idx = rOffset + c;
      if (result[idx] === 0 && vVisited[vOffset + c] === 0) {
        result[idx] = 1;
      }
    }
  }

  return result;
}

// Reusable canvas for polygon rasterization to prevent garbage collection spikes
let polyCanvasCache: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number } | null = null;

/**
 * Fills a polygon defined by points onto the slice mask using hardware-accelerated 2D canvas fill
 */
export function fillPolygonOnMask(
  mask: Uint8Array,
  rows: number,
  cols: number,
  points: Array<[number, number]>,
  value: 0 | 1 = 1
) {
  if (points.length < 3) return;
  invalidateMask(mask);

  if (!polyCanvasCache || polyCanvasCache.width !== cols || polyCanvasCache.height !== rows) {
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    polyCanvasCache = { canvas, ctx, width: cols, height: rows };
  }

  const { ctx } = polyCanvasCache;

  // Calculate polygon bounding box to restrict pixel operations
  let minX = cols;
  let maxX = 0;
  let minY = rows;
  let maxY = 0;
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const bMinX = Math.max(0, Math.floor(minX) - 1);
  const bMaxX = Math.min(cols - 1, Math.ceil(maxX) + 1);
  const bMinY = Math.max(0, Math.floor(minY) - 1);
  const bMaxY = Math.min(rows - 1, Math.ceil(maxY) + 1);
  const bW = bMaxX - bMinX + 1;
  const bH = bMaxY - bMinY + 1;

  if (bW <= 0 || bH <= 0) return;

  // Clear only the bounding box
  ctx.clearRect(bMinX, bMinY, bW, bH);

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  ctx.fill();

  const imgData = ctx.getImageData(bMinX, bMinY, bW, bH).data;
  for (let y = 0; y < bH; y++) {
    const rowOffset = (bMinY + y) * cols + bMinX;
    const imgRowOffset = y * bW * 4;
    for (let x = 0; x < bW; x++) {
      if (imgData[imgRowOffset + x * 4 + 3] > 120) {
        mask[rowOffset + x] = value;
      }
    }
  }
}

/**
 * Tight Bounding Box for non-zero foreground voxels in a mask
 */
export interface MaskBoundingBox {
  minR: number;
  maxR: number;
  minC: number;
  maxC: number;
}

const maskBoundingBoxCache = new WeakMap<Uint8Array, MaskBoundingBox | null>();
const maskRevisions = new WeakMap<Uint8Array, number>();

export function getMaskRevision(mask: Uint8Array): number {
  return maskRevisions.get(mask) || 0;
}

// Only edit drafts. Committed ROI masks remain immutable so undo and aggregate
// ROI caches can continue sharing them. All in-place painting invalidates derived data.
function invalidateMask(mask: Uint8Array): void {
  maskRevisions.set(mask, getMaskRevision(mask) + 1);
  maskBoundingBoxCache.delete(mask);
  maskVoxelCache.delete(mask);
  sliceHuCache.delete(mask);
  sliceVolumeCache.delete(mask);
  sdfCache.delete(mask);
}

/**
 * Computes tight bounding box of non-zero foreground voxels in a mask.
 * Uses 32-bit word scanning to skip empty rows in a few clock cycles.
 * Returns null if the mask is empty.
 */
export function getMaskBoundingBox(
  mask: Uint8Array,
  rows: number,
  cols: number
): MaskBoundingBox | null {
  const cached = maskBoundingBoxCache.get(mask);
  if (cached !== undefined) return cached;

  const is32Aligned = (mask.byteOffset % 4 === 0) && ((cols & 3) === 0);
  const u32Cols = cols >> 2;
  const u32 = is32Aligned ? new Uint32Array(mask.buffer, mask.byteOffset, mask.byteLength >> 2) : null;

  let minR = -1;
  let maxR = -1;

  for (let r = 0; r < rows; r++) {
    let rowHasPixels = false;
    if (u32) {
      const rOffset32 = r * u32Cols;
      for (let k = 0; k < u32Cols; k++) {
        if (u32[rOffset32 + k] !== 0) {
          rowHasPixels = true;
          break;
        }
      }
    } else {
      const rOffset = r * cols;
      for (let c = 0; c < cols; c++) {
        if (mask[rOffset + c] !== 0) {
          rowHasPixels = true;
          break;
        }
      }
    }

    if (rowHasPixels) {
      if (minR === -1) minR = r;
      maxR = r;
    }
  }

  if (minR === -1) {
    maskBoundingBoxCache.set(mask, null);
    maskVoxelCache.set(mask, 0);
    return null;
  }

  let minC = cols;
  let maxC = -1;

  for (let r = minR; r <= maxR; r++) {
    const rOffset = r * cols;
    if (u32) {
      const rOffset32 = r * u32Cols;
      for (let k = 0; k < u32Cols; k++) {
        if (u32[rOffset32 + k] !== 0) {
          const baseC = k << 2;
          for (let b = 0; b < 4; b++) {
            const c = baseC + b;
            if (mask[rOffset + c] === 1) {
              if (c < minC) minC = c;
              if (c > maxC) maxC = c;
            }
          }
        }
      }
    } else {
      for (let c = 0; c < cols; c++) {
        if (mask[rOffset + c] === 1) {
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }
  }

  const bbox: MaskBoundingBox = { minR, maxR, minC, maxC };
  maskBoundingBoxCache.set(mask, bbox);
  return bbox;
}

/**
 * Boolean Operations between two masks of identical dimensions.
 * Optimized with 32-bit SIMD-style word parallel processing (4 bytes per instruction).
 */
export function applyBooleanOperationToMasks(
  maskA: Uint8Array,
  maskB: Uint8Array,
  operation: BooleanOpType
): Uint8Array {
  const len = maskA.length;
  const result = new Uint8Array(len);

  // High-performance 32-bit word parallel path (4 bytes per cycle, branch-free)
  const is32Aligned = (maskA.byteOffset % 4 === 0) &&
                      (maskB.byteOffset % 4 === 0) &&
                      (result.byteOffset % 4 === 0) &&
                      ((len & 3) === 0);

  if (is32Aligned) {
    const wordLen = len >> 2;
    const u32A = new Uint32Array(maskA.buffer, maskA.byteOffset, wordLen);
    const u32B = new Uint32Array(maskB.buffer, maskB.byteOffset, wordLen);
    const u32Res = new Uint32Array(result.buffer, result.byteOffset, wordLen);

    switch (operation) {
      case 'union':
        for (let w = 0; w < wordLen; w++) {
          u32Res[w] = u32A[w] | u32B[w];
        }
        return result;
      case 'intersection':
        for (let w = 0; w < wordLen; w++) {
          u32Res[w] = u32A[w] & u32B[w];
        }
        return result;
      case 'difference':
        // For bytes with 0 or 1, difference A & !B is precisely u32A & ~u32B
        for (let w = 0; w < wordLen; w++) {
          u32Res[w] = u32A[w] & (~u32B[w]);
        }
        return result;
      case 'xor':
        for (let w = 0; w < wordLen; w++) {
          u32Res[w] = u32A[w] ^ u32B[w];
        }
        return result;
    }
  }

  // Fallback byte-wise path
  switch (operation) {
    case 'union':
      for (let i = 0; i < len; i++) {
        result[i] = (maskA[i] || maskB[i]) ? 1 : 0;
      }
      break;
    case 'intersection':
      for (let i = 0; i < len; i++) {
        result[i] = (maskA[i] && maskB[i]) ? 1 : 0;
      }
      break;
    case 'difference': // A - B (in A but not in B)
      for (let i = 0; i < len; i++) {
        result[i] = (maskA[i] && !maskB[i]) ? 1 : 0;
      }
      break;
    case 'xor': // Symmetric difference: (A | B) - (A & B)
      for (let i = 0; i < len; i++) {
        result[i] = (maskA[i] ^ maskB[i]) ? 1 : 0;
      }
      break;
  }

  return result;
}

/**
 * Morphological dilation using circular structuring element of given radius in pixels.
 * Highly optimized with boundary-only stamping within computed bounding box.
 */
export function dilateMask(
  srcMask: Uint8Array,
  rows: number,
  cols: number,
  radiusPx: number
): Uint8Array {
  if (radiusPx <= 0) return cloneMask(srcMask);

  const bbox = getMaskBoundingBox(srcMask, rows, cols);
  if (!bbox) return cloneMask(srcMask);

  const rInt = Math.ceil(radiusPx);
  const r2 = radiusPx * radiusPx;
  const outMask = cloneMask(srcMask);

  // Precompute offsets for circular structuring element
  const offsets: Array<{ dr: number; dc: number }> = [];
  for (let dr = -rInt; dr <= rInt; dr++) {
    for (let dc = -rInt; dc <= rInt; dc++) {
      if (dr * dr + dc * dc <= r2) {
        offsets.push({ dr, dc });
      }
    }
  }

  // Fast dilation: only iterate over BOUNDARY foreground pixels within bounding box
  for (let r = bbox.minR; r <= bbox.maxR; r++) {
    const rOffset = r * cols;
    const isBoundaryRow = (r === 0 || r === rows - 1);
    for (let c = bbox.minC; c <= bbox.maxC; c++) {
      const idx = rOffset + c;
      if (srcMask[idx] === 1) {
        const isBorder = (
          isBoundaryRow || c === 0 || c === cols - 1 ||
          srcMask[idx - 1] === 0 || srcMask[idx + 1] === 0 ||
          srcMask[idx - cols] === 0 || srcMask[idx + cols] === 0
        );
        if (isBorder) {
          for (let i = 0; i < offsets.length; i++) {
            const nr = r + offsets[i].dr;
            const nc = c + offsets[i].dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              outMask[nr * cols + nc] = 1;
            }
          }
        }
      }
    }
  }

  return outMask;
}

/**
 * Morphological erosion using circular structuring element.
 * Highly optimized with boundary-adjacent background stamping within bounding box.
 */
export function erodeMask(
  srcMask: Uint8Array,
  rows: number,
  cols: number,
  radiusPx: number
): Uint8Array {
  if (radiusPx <= 0) return cloneMask(srcMask);

  const bbox = getMaskBoundingBox(srcMask, rows, cols);
  if (!bbox) return cloneMask(srcMask);

  const rInt = Math.ceil(radiusPx);
  const r2 = radiusPx * radiusPx;
  const outMask = cloneMask(srcMask);

  // Precompute offsets for circular structuring element
  const offsets: Array<{ dr: number; dc: number }> = [];
  for (let dr = -rInt; dr <= rInt; dr++) {
    for (let dc = -rInt; dc <= rInt; dc++) {
      if (dr * dr + dc * dc <= r2) {
        offsets.push({ dr, dc });
      }
    }
  }

  const rStart = Math.max(0, bbox.minR - 1);
  const rEnd = Math.min(rows - 1, bbox.maxR + 1);
  const cStart = Math.max(0, bbox.minC - 1);
  const cEnd = Math.min(cols - 1, bbox.maxC + 1);

  // Fast erosion: only iterate over 0-pixels that neighbor the structure boundary
  for (let r = rStart; r <= rEnd; r++) {
    const rOffset = r * cols;
    for (let c = cStart; c <= cEnd; c++) {
      const idx = rOffset + c;
      if (srcMask[idx] === 0) {
        const isNeighborToForeground = (
          (r > 0 && srcMask[idx - cols] === 1) ||
          (r < rows - 1 && srcMask[idx + cols] === 1) ||
          (c > 0 && srcMask[idx - 1] === 1) ||
          (c < cols - 1 && srcMask[idx + 1] === 1)
        );
        if (isNeighborToForeground) {
          for (let i = 0; i < offsets.length; i++) {
            const nr = r + offsets[i].dr;
            const nc = c + offsets[i].dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              outMask[nr * cols + nc] = 0;
            }
          }
        }
      }
    }
  }

  return outMask;
}

/**
 * Generates radiotherapy margins (expansion or erosion) in millimeters
 * @param marginMm positive for expansion/dilation, negative for erosion/contraction
 */
export function generateMarginMask(
  srcMask: Uint8Array,
  rows: number,
  cols: number,
  marginMm: number,
  pixelSpacingMm: number = 1.0
): Uint8Array {
  if (Math.abs(marginMm) < 0.05) {
    return cloneMask(srcMask);
  }

  const radiusPx = Math.abs(marginMm) / pixelSpacingMm;

  if (marginMm > 0) {
    return dilateMask(srcMask, rows, cols, radiusPx);
  } else {
    return erodeMask(srcMask, rows, cols, radiusPx);
  }
}

/**
 * Creates a uniform AsymmetricMargin where all 6 directions share the same distance in mm.
 */
export function createUniformMargin(marginMm: number): AsymmetricMargin {
  return {
    superior: marginMm,
    inferior: marginMm,
    anterior: marginMm,
    posterior: marginMm,
    left: marginMm,
    right: marginMm,
  };
}

/**
 * Checks if all directional margin values are practically zero (< 0.05 mm).
 */
export function isZeroMargin(margin?: AsymmetricMargin | null): boolean {
  if (!margin) return true;
  return (
    Math.abs(margin.superior) < 0.05 &&
    Math.abs(margin.inferior) < 0.05 &&
    Math.abs(margin.anterior) < 0.05 &&
    Math.abs(margin.posterior) < 0.05 &&
    Math.abs(margin.left) < 0.05 &&
    Math.abs(margin.right) < 0.05
  );
}

/**
 * Precomputes 2D asymmetric structuring element offsets in pixel coordinates.
 * Positive margins in 4 in-plane directions: anterior, posterior, left, right (in mm).
 * Ant (-r, towards top), Post (+r, towards bottom), Left (+c, towards patient left), Right (-c, towards patient right).
 */
export function getAsymmetricDilationOffsets(
  antMm: number,
  postMm: number,
  leftMm: number,
  rightMm: number,
  dxMm: number,
  dyMm: number
): Array<{ dr: number; dc: number }> {
  if (antMm <= 0.01 && postMm <= 0.01 && leftMm <= 0.01 && rightMm <= 0.01) {
    return [];
  }

  const drMin = antMm > 0.01 ? -Math.ceil(antMm / dyMm) : 0;
  const drMax = postMm > 0.01 ? Math.ceil(postMm / dyMm) : 0;
  const dcMin = rightMm > 0.01 ? -Math.ceil(rightMm / dxMm) : 0;
  const dcMax = leftMm > 0.01 ? Math.ceil(leftMm / dxMm) : 0;

  const offsets: Array<{ dr: number; dc: number }> = [];

  for (let dr = drMin; dr <= drMax; dr++) {
    const rMm = dr < 0 ? antMm : dr > 0 ? postMm : 0;
    for (let dc = dcMin; dc <= dcMax; dc++) {
      if (dr === 0 && dc === 0) continue; // center is already in foreground

      const cMm = dc > 0 ? leftMm : dc < 0 ? rightMm : 0;

      // Anisotropic elliptic distance in the quadrant
      let d2 = 0;
      if (dr !== 0) {
        if (rMm <= 0.01) continue;
        const termR = (Math.abs(dr) * dyMm) / rMm;
        d2 += termR * termR;
      }
      if (dc !== 0) {
        if (cMm <= 0.01) continue;
        const termC = (Math.abs(dc) * dxMm) / cMm;
        d2 += termC * termC;
      }

      if (d2 <= 1.0001) {
        offsets.push({ dr, dc });
      }
    }
  }

  return offsets;
}

/**
 * Highly optimized 2D asymmetric dilation stamping only on mask boundary pixels.
 */
export function dilateAsymmetric2D(
  srcMask: Uint8Array,
  rows: number,
  cols: number,
  antMm: number,
  postMm: number,
  leftMm: number,
  rightMm: number,
  dxMm: number,
  dyMm: number
): Uint8Array {
  const offsets = getAsymmetricDilationOffsets(antMm, postMm, leftMm, rightMm, dxMm, dyMm);
  if (offsets.length === 0) return cloneMask(srcMask);

  const bbox = getMaskBoundingBox(srcMask, rows, cols);
  if (!bbox) return cloneMask(srcMask);

  const outMask = cloneMask(srcMask);

  for (let r = bbox.minR; r <= bbox.maxR; r++) {
    const rOffset = r * cols;
    const isBoundaryRow = (r === 0 || r === rows - 1);
    for (let c = bbox.minC; c <= bbox.maxC; c++) {
      const idx = rOffset + c;
      if (srcMask[idx] === 1) {
        const isBorder = (
          isBoundaryRow || c === 0 || c === cols - 1 ||
          srcMask[idx - 1] === 0 || srcMask[idx + 1] === 0 ||
          srcMask[idx - cols] === 0 || srcMask[idx + cols] === 0
        );
        if (isBorder) {
          for (let i = 0; i < offsets.length; i++) {
            const nr = r + offsets[i].dr;
            const nc = c + offsets[i].dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              outMask[nr * cols + nc] = 1;
            }
          }
        }
      }
    }
  }

  return outMask;
}

/**
 * Morphological erosion using an asymmetric structuring element.
 * Applies inverted background expansion: background expands inward to carve the structure.
 */
export function erodeAsymmetric2D(
  srcMask: Uint8Array,
  rows: number,
  cols: number,
  antErodeMm: number,
  postErodeMm: number,
  leftErodeMm: number,
  rightErodeMm: number,
  dxMm: number,
  dyMm: number
): Uint8Array {
  // Invert directional margins for background expansion:
  // Anterior border expands Posterior into structure -> post margin is antErodeMm
  // Posterior border expands Anterior into structure -> ant margin is postErodeMm
  // Left border expands Right into structure -> right margin is leftErodeMm
  // Right border expands Left into structure -> left margin is rightErodeMm
  const offsets = getAsymmetricDilationOffsets(
    postErodeMm,
    antErodeMm,
    rightErodeMm,
    leftErodeMm,
    dxMm,
    dyMm
  );
  if (offsets.length === 0) return cloneMask(srcMask);

  const outMask = cloneMask(srcMask);
  // Erosion is the reflected kernel applied to foreground; outside the FOV is background.
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(srcMask[r*cols+c]){
    for(const {dr,dc} of offsets){const nr=r-dr,nc=c-dc;
      if(nr<0 || nr>=rows || nc<0 || nc>=cols || !srcMask[nr*cols+nc]){outMask[r*cols+c]=0;break;}
    }
  }

  return outMask;
}

/**
 * Generates an in-plane (2D) asymmetric margin with support for positive (expansion)
 * and negative (erosion) values in anterior, posterior, left, right directions.
 */
export function generateAsymmetricMargin2D(
  srcMask: Uint8Array,
  rows: number,
  cols: number,
  margin: { anterior: number; posterior: number; left: number; right: number },
  pixelSpacing: [number, number] = [1.0, 1.0]
): Uint8Array {
  const dxMm = pixelSpacing[1] || 1.0;
  const dyMm = pixelSpacing[0] || 1.0;

  let current = cloneMask(srcMask);

  // 1. Erosion pass (negative values)
  const antErode = margin.anterior < -0.01 ? Math.abs(margin.anterior) : 0;
  const postErode = margin.posterior < -0.01 ? Math.abs(margin.posterior) : 0;
  const leftErode = margin.left < -0.01 ? Math.abs(margin.left) : 0;
  const rightErode = margin.right < -0.01 ? Math.abs(margin.right) : 0;

  if (antErode > 0 || postErode > 0 || leftErode > 0 || rightErode > 0) {
    current = erodeAsymmetric2D(
      current,
      rows,
      cols,
      antErode,
      postErode,
      leftErode,
      rightErode,
      dxMm,
      dyMm
    );
  }

  // 2. Dilation pass (positive values)
  const antDilate = margin.anterior > 0.01 ? margin.anterior : 0;
  const postDilate = margin.posterior > 0.01 ? margin.posterior : 0;
  const leftDilate = margin.left > 0.01 ? margin.left : 0;
  const rightDilate = margin.right > 0.01 ? margin.right : 0;

  if (antDilate > 0 || postDilate > 0 || leftDilate > 0 || rightDilate > 0) {
    current = dilateAsymmetric2D(
      current,
      rows,
      cols,
      antDilate,
      postDilate,
      leftDilate,
      rightDilate,
      dxMm,
      dyMm
    );
  }

  return current;
}

/**
 * Generates full 3D radiotherapy margins across all 6 directional axes:
 * Superior (Arriba), Inferior (Abajo), Anterior (Adelante), Posterior (Atrás), Izquierda (Left), Derecha (Right).
 * Supports positive values (expansion) and negative values (erosion).
 */
export function generateAsymmetricMargin3D(
  series: DicomSeries,
  srcMasks: { [sliceIdx: number]: Uint8Array },
  margin: AsymmetricMargin
): { [sliceIdx: number]: Uint8Array } {
  if (isZeroMargin(margin)) {
    const res: { [sliceIdx: number]: Uint8Array } = {};
    for (const [k, v] of Object.entries(srcMasks)) {
      if (v) res[Number(k)] = cloneMask(v);
    }
    return res;
  }

  const values=Object.values(margin);
  if(values.every(v=>Math.abs(v-values[0])<1e-8)){
    const first=series.slices[0],nx=first.cols,ny=first.rows,nz=series.slices.length,r=values[0],spacing:[number,number,number]=[first.pixelSpacing[1],first.pixelSpacing[0],voxelDepth(series.slices,first)];
    const features=new Uint8Array(nx*ny*nz);for(let z=0;z<nz;z++)for(let i=0;i<nx*ny;i++)features[z*nx*ny+i]=r<0?1-(srcMasks[z]?.[i] || 0):(srcMasks[z]?.[i] || 0);
    const distances=distanceSquared(features,nx,ny,nz,spacing),result={};
    for(let z=0;z<nz;z++){const mask=new Uint8Array(nx*ny);for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const n=z*nx*ny+y*nx+x;let d=distances[n];if(r<0)d=Math.min(d,((x+1)*spacing[0])**2,((nx-x)*spacing[0])**2,((y+1)*spacing[1])**2,((ny-y)*spacing[1])**2,((z+1)*spacing[2])**2,((nz-z)*spacing[2])**2);mask[y*nx+x]=r<0?Number(d>r*r+1e-8):Number(d<=r*r+1e-8);}result[z]=mask;}return result;
  }
  const sortedSlices = [...series.slices].sort((a, b) => a.sliceIndex - b.sliceIndex);
  const numSlices = sortedSlices.length;
  if (numSlices === 0) return {};

  const rows = sortedSlices[0].rows;
  const cols = sortedSlices[0].cols;
  const pixelSpacing = sortedSlices[0].pixelSpacing;

  const firstLoc = sortedSlices[0].sliceLocation ?? 0;
  const lastLoc = sortedSlices[numSlices - 1].sliceLocation ?? 0;
  const isZAscending = firstLoc <= lastLoc;

  let nominalSpacingZ = 2.5;
  if (numSlices > 1 && Math.abs(lastLoc - firstLoc) > 0.01) {
    nominalSpacingZ = Math.abs(lastLoc - firstLoc) / (numSlices - 1);
  } else if (sortedSlices[0].sliceThickness && sortedSlices[0].sliceThickness > 0.1) {
    nominalSpacingZ = sortedSlices[0].sliceThickness;
  }

  const sliceZPositions = new Map<number, number>();
  for (const s of sortedSlices) {
    const zPos = s.sliceLocation !== undefined ? s.sliceLocation : s.sliceIndex * nominalSpacingZ;
    sliceZPositions.set(s.sliceIndex, zPos);
  }

  const supMm = margin.superior;
  const infMm = margin.inferior;
  const antMm = margin.anterior;
  const postMm = margin.posterior;
  const leftMm = margin.left;
  const rightMm = margin.right;

  // If both superior and inferior are practically 0, run fast per-slice 2D asymmetric margins
  if (Math.abs(supMm) < 0.05 && Math.abs(infMm) < 0.05) {
    const outMasks: { [sliceIdx: number]: Uint8Array } = {};
    for (const s of sortedSlices) {
      const src = srcMasks[s.sliceIndex];
      if (!src || !hasMaskContour(src)) continue;
      outMasks[s.sliceIndex] = generateAsymmetricMargin2D(
        src,
        rows,
        cols,
        { anterior: antMm, posterior: postMm, left: leftMm, right: rightMm },
        s.pixelSpacing
      );
    }
    return outMasks;
  }

  let currentMasks = { ...srcMasks };

  // 1. EROSION PASS (if any negative direction)
  const hasErosion = (
    supMm < -0.05 || infMm < -0.05 ||
    antMm < -0.05 || postMm < -0.05 ||
    leftMm < -0.05 || rightMm < -0.05
  );

  if (hasErosion) {
    const limits=[Math.max(0,-rightMm),Math.max(0,-leftMm),Math.max(0,-antMm),Math.max(0,-postMm),Math.max(0,-infMm),Math.max(0,-supMm)];
    const spacing=[pixelSpacing[1],pixelSpacing[0],nominalSpacingZ];
    const offsets:number[][]=[];
    for(let z=-Math.floor(limits[4]/spacing[2]);z<=Math.floor(limits[5]/spacing[2]);z++)
    for(let y=-Math.floor(limits[2]/spacing[1]);y<=Math.floor(limits[3]/spacing[1]);y++)
    for(let x=-Math.floor(limits[0]/spacing[0]);x<=Math.floor(limits[1]/spacing[0]);x++){
      const values=[x,y,z];let distance=0;for(let axis=0;axis<3;axis++)if(values[axis])distance+=(values[axis]*spacing[axis]/limits[axis*2+(values[axis]>0?1:0)])**2;
      if(distance<=1+1e-8)offsets.push(values);
    }
    const result={};for(let z=0;z<numSlices;z++){const source=currentMasks[z];if(!source)continue;const out=new Uint8Array(rows*cols);
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(source[y*cols+x]){let keep=true;for(const [dx,dy,dz] of offsets){const xx=x+dx,yy=y+dy,zz=z+dz;if(xx<0 || yy<0 || xx>=cols || yy>=rows || zz<0 || zz>=numSlices || !currentMasks[zz]?.[yy*cols+xx]){keep=false;break;}}if(keep)out[y*cols+x]=1;}result[z]=out;
    }currentMasks=result;
  }

  // 2. DILATION PASS (if any positive direction)
  const hasDilation = (
    supMm > 0.05 || infMm > 0.05 ||
    antMm > 0.05 || postMm > 0.05 ||
    leftMm > 0.05 || rightMm > 0.05
  );

  if (hasDilation) {
    const supDilate = supMm > 0.05 ? supMm : 0;
    const infDilate = infMm > 0.05 ? infMm : 0;
    const antDilate = antMm > 0.05 ? antMm : 0;
    const postDilate = postMm > 0.05 ? postMm : 0;
    const leftDilate = leftMm > 0.05 ? leftMm : 0;
    const rightDilate = rightMm > 0.05 ? rightMm : 0;

    const dilatedMasks: { [sliceIdx: number]: Uint8Array } = {};
    for (const s of sortedSlices) {
      dilatedMasks[s.sliceIndex] = createEmptyMask(rows, cols);
    }

    const maxZDilate = Math.max(supDilate, infDilate);
    const maxSliceOffset = Math.ceil(maxZDilate / nominalSpacingZ) + 1;

    for (let sIdx = 0; sIdx < numSlices; sIdx++) {
      const srcSlice = sortedSlices[sIdx];
      const srcMask = currentMasks[srcSlice.sliceIndex];
      if (!srcMask || !hasMaskContour(srcMask)) continue;

      const srcZ = sliceZPositions.get(srcSlice.sliceIndex) ?? (sIdx * nominalSpacingZ);

      const minK = Math.max(0, sIdx - maxSliceOffset);
      const maxK = Math.min(numSlices - 1, sIdx + maxSliceOffset);

      for (let k = minK; k <= maxK; k++) {
        const targetSlice = sortedSlices[k];
        const targetZ = sliceZPositions.get(targetSlice.sliceIndex) ?? (k * nominalSpacingZ);

        const zDiffMm = isZAscending ? (targetZ - srcZ) : (srcZ - targetZ);
        const limitMm = zDiffMm >= 0 ? supDilate : infDilate;
        const absZ = Math.abs(zDiffMm);

        let rho = 1.0;
        if (limitMm > 0.05) {
          if (absZ > limitMm) continue;
          rho = Math.sqrt(Math.max(0, 1.0 - (absZ * absZ) / (limitMm * limitMm)));
        } else if (absZ > 0.05) {
          continue;
        }

        const antEff = antDilate * rho;
        const postEff = postDilate * rho;
        const leftEff = leftDilate * rho;
        const rightEff = rightDilate * rho;

        let sliceContribution: Uint8Array;
        if (antEff > 0.05 || postEff > 0.05 || leftEff > 0.05 || rightEff > 0.05) {
          sliceContribution = dilateAsymmetric2D(
            srcMask,
            rows,
            cols,
            antEff,
            postEff,
            leftEff,
            rightEff,
            pixelSpacing[1],
            pixelSpacing[0]
          );
        } else {
          sliceContribution = srcMask;
        }

        const targetMask = dilatedMasks[targetSlice.sliceIndex];
        const is32 = (targetMask.byteOffset % 4 === 0) && (sliceContribution.byteOffset % 4 === 0) && ((targetMask.length & 3) === 0);
        if (is32) {
          const u32Target = new Uint32Array(targetMask.buffer, targetMask.byteOffset, targetMask.length >> 2);
          const u32Contrib = new Uint32Array(sliceContribution.buffer, sliceContribution.byteOffset, sliceContribution.length >> 2);
          const wLen = targetMask.length >> 2;
          for (let w = 0; w < wLen; w++) {
            u32Target[w] |= u32Contrib[w];
          }
        } else {
          for (let i = 0; i < targetMask.length; i++) {
            if (sliceContribution[i] === 1) {
              targetMask[i] = 1;
            }
          }
        }
      }
    }

    currentMasks = dilatedMasks;
  }

  return currentMasks;
}

// Global WeakMap caches to eliminate redundant 262,144-voxel array iterations
const maskVoxelCache = new WeakMap<Uint8Array, number>();
const roiVolumeCache = new WeakMap<StructureRoi, number>();
const sliceMasksVolumeCache = new WeakMap<StructureRoi['sliceMasks'], number>();
const contouredSlicesCache = new WeakMap<StructureRoi, number[]>();
const sliceMasksContouredSlicesCache = new WeakMap<StructureRoi['sliceMasks'], number[]>();

interface SliceHuStats {
  count: number;
  sum: number;
  min: number;
  max: number;
}
const sliceHuCache = new WeakMap<Uint8Array, SliceHuStats>();
const roiHuStatsCache = new WeakMap<StructureRoi, { minHU: number; maxHU: number; meanHU: number; voxelCount: number; volumeCm3: number }>();
const sliceMasksHuStatsCache = new WeakMap<StructureRoi['sliceMasks'], { minHU: number; maxHU: number; meanHU: number; voxelCount: number; volumeCm3: number }>();
const sliceVolumeCache = new WeakMap<Uint8Array, number>();
const sliceMapCache = new WeakMap<DicomSlice[], Map<number, DicomSlice>>();

/**
 * Reusable SliceMap cache to avoid allocating Map on every calculation
 */
function getSliceMap(slices: DicomSlice[]): Map<number, DicomSlice> {
  let map = sliceMapCache.get(slices);
  if (!map) {
    map = new Map<number, DicomSlice>();
    for (let i = 0; i < slices.length; i++) {
      map.set(slices[i].sliceIndex, slices[i]);
    }
    sliceMapCache.set(slices, map);
  }
  return map;
}

/**
 * Ultra-fast check if a slice mask contains any non-zero contour voxels
 * Uses 32-bit word scanning (4 bytes per cycle) with safe alignment checks to skip empty slices in microseconds
 */
export function hasMaskContour(mask: Uint8Array): boolean {
  const cachedCount = maskVoxelCache.get(mask);
  if (cachedCount !== undefined) {
    return cachedCount > 0;
  }
  // Safe 32-bit word scan if 4-byte aligned
  if (mask.byteOffset % 4 === 0) {
    const u32Len = mask.byteLength >> 2;
    const u32 = new Uint32Array(mask.buffer, mask.byteOffset, u32Len);
    for (let i = 0; i < u32Len; i++) {
      if (u32[i] !== 0) return true;
    }
    for (let i = u32Len << 2; i < mask.length; i++) {
      if (mask[i] !== 0) return true;
    }
  } else {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 0) return true;
    }
  }
  maskVoxelCache.set(mask, 0);
  return false;
}

/**
 * Returns the voxel count of a mask with SIMD-like 32-bit word aggregation and O(1) cache
 */
export function getMaskVoxelCount(mask: Uint8Array): number {
  const cached = maskVoxelCache.get(mask);
  if (cached !== undefined) return cached;

  let count = 0;
  if (mask.byteOffset % 4 === 0) {
    const u32Len = mask.byteLength >> 2;
    const u32 = new Uint32Array(mask.buffer, mask.byteOffset, u32Len);

    for (let i = 0; i < u32Len; i++) {
      const val = u32[i];
      if (val !== 0) {
        count += (val & 0xFF) + ((val >> 8) & 0xFF) + ((val >> 16) & 0xFF) + ((val >>> 24) & 0xFF);
      }
    }

    for (let i = u32Len << 2; i < mask.length; i++) {
      if (mask[i] === 1) count++;
    }
  } else {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) count++;
    }
  }

  maskVoxelCache.set(mask, count);
  return count;
}

/**
 * Calculates volume of a structure in cubic centimeters (cm3) with cached voxel counts
 * and per-slice WeakMap caching so that unchanged slices take 0 microseconds
 */
export function calculateRoiVolumeCm3(
  roi: StructureRoi,
  slices: DicomSlice[]
): number {
  if (slices.length === 0) return 0;

  const cachedByMasks = sliceMasksVolumeCache.get(roi.sliceMasks);
  if (cachedByMasks !== undefined) return cachedByMasks;

  const cached = roiVolumeCache.get(roi);
  if (cached !== undefined) return cached;
  
  const sliceMap = getSliceMap(slices);
  let totalSliceVolume = 0;

  for (const sliceStr in roi.sliceMasks) {
    const mask = roi.sliceMasks[sliceStr as unknown as number];
    if (!mask) continue;

    let sliceVol = sliceVolumeCache.get(mask);
    if (sliceVol === undefined) {
      const sliceVoxelCount = getMaskVoxelCount(mask);
      if (sliceVoxelCount === 0) {
        sliceVol = 0;
      } else {
        const sliceIndex = parseInt(sliceStr, 10);
        const slice = sliceMap.get(sliceIndex);
        if (slice) {
          const voxelVolume_mm3 = slice.pixelSpacing[0] * slice.pixelSpacing[1] * voxelDepth(slices, slice);
          sliceVol = sliceVoxelCount * voxelVolume_mm3;
        } else {
          sliceVol = 0;
        }
      }
      sliceVolumeCache.set(mask, sliceVol);
    }

    totalSliceVolume += sliceVol;
  }

  // Convert mm3 to cm3 (divide by 1000)
  const volumeCm3 = totalSliceVolume / 1000.0;
  roiVolumeCache.set(roi, volumeCm3);
  sliceMasksVolumeCache.set(roi.sliceMasks, volumeCm3);
  return volumeCm3;
}

/**
 * Computes HU statistics inside a structure ROI with per-slice WeakMap caching
 * and bounding-box acceleration to avoid checking 262k pixels on every slice
 */
export function calculateRoiHuStats(
  roi: StructureRoi,
  slices: DicomSlice[]
): { minHU: number; maxHU: number; meanHU: number; voxelCount: number; volumeCm3: number } {
  const cachedByMasks = sliceMasksHuStatsCache.get(roi.sliceMasks);
  if (cachedByMasks) return cachedByMasks;

  const cached = roiHuStatsCache.get(roi);
  if (cached) return cached;

  let totalCount = 0;
  let totalSum = 0;
  let min = Infinity;
  let max = -Infinity;
  let volumeMm3 = 0;

  const sliceMap = getSliceMap(slices);

  for (const sliceStr in roi.sliceMasks) {
    const mask = roi.sliceMasks[sliceStr as unknown as number];
    if (!mask) continue;
    const voxelCount = getMaskVoxelCount(mask);
    if (voxelCount === 0) continue;

    const sliceIndex = parseInt(sliceStr, 10);
    const slice = sliceMap.get(sliceIndex);
    if (!slice) continue;

    let sliceStats = sliceHuCache.get(mask);
    if (!sliceStats) {
      const hu = slice.huData;
      let sCount = 0;
      let sSum = 0;
      let sMin = Infinity;
      let sMax = -Infinity;

      const bbox = getMaskBoundingBox(mask, slice.rows, slice.cols);
      if (bbox) {
        for (let r = bbox.minR; r <= bbox.maxR; r++) {
          const rOffset = r * slice.cols;
          for (let c = bbox.minC; c <= bbox.maxC; c++) {
            const idx = rOffset + c;
            if (mask[idx] === 1) {
              const val = hu[idx];
              sCount++;
              sSum += val;
              if (val < sMin) sMin = val;
              if (val > sMax) sMax = val;
            }
          }
        }
      }

      sliceStats = {
        count: sCount,
        sum: sSum,
        min: sMin === Infinity ? 0 : sMin,
        max: sMax === -Infinity ? 0 : sMax
      };
      sliceHuCache.set(mask, sliceStats);
    }

    if (sliceStats.count > 0) {
      totalCount += sliceStats.count;
      totalSum += sliceStats.sum;
      if (sliceStats.min < min) min = sliceStats.min;
      if (sliceStats.max > max) max = sliceStats.max;

      const voxelMm3 = slice.pixelSpacing[0] * slice.pixelSpacing[1] * voxelDepth(slices, slice);
      volumeMm3 += sliceStats.count * voxelMm3;
    }
  }

  if (totalCount === 0) {
    const emptyStats = { minHU: 0, maxHU: 0, meanHU: 0, voxelCount: 0, volumeCm3: 0 };
    roiHuStatsCache.set(roi, emptyStats);
    sliceMasksHuStatsCache.set(roi.sliceMasks, emptyStats);
    return emptyStats;
  }

  const resultStats = {
    minHU: min,
    maxHU: max,
    meanHU: Math.round(totalSum / totalCount),
    voxelCount: totalCount,
    volumeCm3: Number((volumeMm3 / 1000).toFixed(2))
  };
  roiHuStatsCache.set(roi, resultStats);
  sliceMasksHuStatsCache.set(roi.sliceMasks, resultStats);
  return resultStats;
}

/**
 * Automatically creates a threshold mask for CT range (e.g. Bone > 200 HU)
 */
export function createThresholdMask(
  huData: Int16Array,
  rows: number,
  cols: number,
  minHU: number,
  maxHU: number
): Uint8Array {
  const mask = new Uint8Array(rows * cols);
  for (let i = 0; i < huData.length; i++) {
    const val = huData[i];
    if (val >= minHU && val <= maxHU) {
      mask[i] = 1;
    }
  }
  return mask;
}

/**
 * Computes 2D Euclidean / Chamfer Distance Transform of a binary mask.
 * Returns Float32Array of size rows * cols with distance to nearest feature pixel.
 * @param mask Uint8Array of size rows * cols
 * @param featureVal value that is considered distance 0 (e.g. 1 for distance to foreground, 0 for distance to background)
 */
export function computeDistanceTransform(
  mask: Uint8Array,
  rows: number,
  cols: number,
  featureVal: number
): Float32Array {
  const len = rows * cols;
  const dist = new Float32Array(len);
  const INF = 999999.0;
  const D1 = 1.0;
  const D2 = 1.41421356; // sqrt(2)

  // Initialize: pixels matching featureVal have distance 0, others INF
  for (let i = 0; i < len; i++) {
    dist[i] = mask[i] === featureVal ? 0 : INF;
  }

  // Forward pass: top-left to bottom-right
  for (let r = 0; r < rows; r++) {
    const rowOffset = r * cols;
    const prevRowOffset = (r - 1) * cols;

    for (let c = 0; c < cols; c++) {
      const idx = rowOffset + c;
      let d = dist[idx];
      if (d === 0) continue;

      if (r > 0) {
        // top
        const dt = dist[prevRowOffset + c] + D1;
        if (dt < d) d = dt;

        // top-left
        if (c > 0) {
          const dtl = dist[prevRowOffset + c - 1] + D2;
          if (dtl < d) d = dtl;
        }

        // top-right
        if (c + 1 < cols) {
          const dtr = dist[prevRowOffset + c + 1] + D2;
          if (dtr < d) d = dtr;
        }
      }

      // left
      if (c > 0) {
        const dl = dist[rowOffset + c - 1] + D1;
        if (dl < d) d = dl;
      }

      dist[idx] = d;
    }
  }

  // Backward pass: bottom-right to top-left
  for (let r = rows - 1; r >= 0; r--) {
    const rowOffset = r * cols;
    const nextRowOffset = (r + 1) * cols;

    for (let c = cols - 1; c >= 0; c--) {
      const idx = rowOffset + c;
      let d = dist[idx];
      if (d === 0) continue;

      if (r + 1 < rows) {
        // bottom
        const db = dist[nextRowOffset + c] + D1;
        if (db < d) d = db;

        // bottom-right
        if (c + 1 < cols) {
          const dbr = dist[nextRowOffset + c + 1] + D2;
          if (dbr < d) d = dbr;
        }

        // bottom-left
        if (c > 0) {
          const dbl = dist[nextRowOffset + c - 1] + D2;
          if (dbl < d) d = dbl;
        }
      }

      // right
      if (c + 1 < cols) {
        const dr = dist[rowOffset + c + 1] + D1;
        if (dr < d) d = dr;
      }

      dist[idx] = d;
    }
  }

  return dist;
}

const sdfCache = new WeakMap<Uint8Array, Float32Array>();

/**
 * Computes Signed Distance Field where:
 * - Interior points (mask === 1) have positive distance: +d(p, boundary)
 * - Exterior points (mask === 0) have negative distance: -d(p, boundary)
 */
export function computeSignedDistanceField(
  mask: Uint8Array,
  rows: number,
  cols: number
): Float32Array {
  const cached = sdfCache.get(mask);
  if (cached) return cached;

  const len = rows * cols;
  const sdf = new Float32Array(len);

  // Distance to background (how deep inside foreground)
  const distIn = computeDistanceTransform(mask, rows, cols, 0);

  // Distance to foreground (how far outside in background)
  const distOut = computeDistanceTransform(mask, rows, cols, 1);

  for (let i = 0; i < len; i++) {
    if (mask[i] === 1) {
      sdf[i] = distIn[i] - 0.5;
    } else {
      sdf[i] = -(distOut[i] - 0.5);
    }
  }

  sdfCache.set(mask, sdf);
  return sdf;
}

/**
 * Interpolates between two binary masks using Shape-Based Signed Distance Function (SDF) interpolation.
 * @param maskA Mask at t = 0
 * @param maskB Mask at t = 1
 * @param t Normalized interpolation factor [0..1]
 */
export function interpolateTwoMasksSDF(
  maskA: Uint8Array,
  maskB: Uint8Array,
  rows: number,
  cols: number,
  t: number
): Uint8Array {
  if (t <= 0) return cloneMask(maskA);
  if (t >= 1) return cloneMask(maskB);

  // Check if either mask is completely empty
  let countA = 0;
  let countB = 0;
  const len = rows * cols;
  for (let i = 0; i < len; i++) {
    if (maskA[i]) countA++;
    if (maskB[i]) countB++;
  }

  if (countA === 0 && countB === 0) {
    return createEmptyMask(rows, cols);
  }

  const sdfA = computeSignedDistanceField(maskA, rows, cols);
  const sdfB = computeSignedDistanceField(maskB, rows, cols);

  const result = new Uint8Array(len);
  const wA = 1.0 - t;
  const wB = t;

  for (let i = 0; i < len; i++) {
    const interpolatedVal = wA * sdfA[i] + wB * sdfB[i];
    if (interpolatedVal >= 0) {
      result[i] = 1;
    }
  }

  return result;
}

/**
 * Finds all slice indices in an ROI that contain at least one contoured pixel
 */
export function getContouredSliceIndices(roi: StructureRoi): number[] {
  const cachedByMasks = sliceMasksContouredSlicesCache.get(roi.sliceMasks);
  if (cachedByMasks) return cachedByMasks;

  const cached = contouredSlicesCache.get(roi);
  if (cached) return cached;

  const indices: number[] = [];
  for (const [sliceStr, mask] of Object.entries(roi.sliceMasks)) {
    if (!mask) continue;
    const sliceIndex = parseInt(sliceStr, 10);
    if (isNaN(sliceIndex)) continue;
    if (getMaskVoxelCount(mask) > 0) {
      indices.push(sliceIndex);
    }
  }
  const result = indices.sort((a, b) => a - b);
  contouredSlicesCache.set(roi, result);
  sliceMasksContouredSlicesCache.set(roi.sliceMasks, result);
  return result;
}

/**
 * Automatically interpolates all gaps between contoured slices in a StructureRoi
 */
export function interpolateContourGaps(
  roi: StructureRoi,
  rows: number,
  cols: number
): { updatedRoi: StructureRoi; interpolatedSlices: number[] } {
  const contouredSlices = getContouredSliceIndices(roi);
  if (contouredSlices.length < 2) {
    throw new Error('Se necesitan al menos 2 cortes con contornos dibujados para interpolar.');
  }

  const updatedMasks = { ...roi.sliceMasks };
  const interpolatedSlices: number[] = [];

  for (let k = 0; k < contouredSlices.length - 1; k++) {
    const zA = contouredSlices[k];
    const zB = contouredSlices[k + 1];
    const gapSize = zB - zA;

    if (gapSize > 1) {
      const maskA = roi.sliceMasks[zA];
      const maskB = roi.sliceMasks[zB];

      for (let z = zA + 1; z < zB; z++) {
        const t = (z - zA) / gapSize;
        const interpMask = interpolateTwoMasksSDF(maskA, maskB, rows, cols, t);
        updatedMasks[z] = interpMask;
        interpolatedSlices.push(z);
      }
    }
  }

  if (interpolatedSlices.length === 0) {
    throw new Error('No se encontraron cortes vacíos intermedios (brechas) entre los contornos existentes.');
  }

  const updatedRoi: StructureRoi = {
    ...roi,
    sliceMasks: updatedMasks
  };

  return { updatedRoi, interpolatedSlices };
}

/**
 * Interpolates slices in a specific range [startSlice, endSlice]
 */
export function interpolateContourRange(
  roi: StructureRoi,
  startSlice: number,
  endSlice: number,
  rows: number,
  cols: number
): { updatedRoi: StructureRoi; interpolatedSlices: number[] } {
  if (startSlice >= endSlice) {
    throw new Error('El corte inicial debe ser menor que el corte final.');
  }

  const maskA = roi.sliceMasks[startSlice];
  const maskB = roi.sliceMasks[endSlice];

  if (!maskA || !maskB) {
    throw new Error('Tanto el corte inicial como el corte final deben contener un contorno dibujado.');
  }

  // Verify non-empty
  let hasA = false;
  let hasB = false;
  for (let i = 0; i < maskA.length; i++) {
    if (maskA[i] === 1) { hasA = true; break; }
  }
  for (let i = 0; i < maskB.length; i++) {
    if (maskB[i] === 1) { hasB = true; break; }
  }

  if (!hasA || !hasB) {
    throw new Error('Tanto el corte inicial como el corte final deben contener contornos válidos para interpolar.');
  }

  const updatedMasks = { ...roi.sliceMasks };
  const interpolatedSlices: number[] = [];
  const gapSize = endSlice - startSlice;

  for (let z = startSlice + 1; z < endSlice; z++) {
    const t = (z - startSlice) / gapSize;
    const interpMask = interpolateTwoMasksSDF(maskA, maskB, rows, cols, t);
    updatedMasks[z] = interpMask;
    interpolatedSlices.push(z);
  }

  const updatedRoi: StructureRoi = {
    ...roi,
    sliceMasks: updatedMasks
  };

  return { updatedRoi, interpolatedSlices };
}

/**
 * Configuration options for automated BODY / External patient contour generation
 */
export interface BodyContourOptions {
  minComponentAreaMm2?: number;
  smoothingRadiusMm?: number;
  tableExclusionRow?: number;
  tableExclusionFraction?: number;
  useContinuity?: boolean;
  /** HU threshold above which voxels are considered tissue (skin/body). Default: -700 HU */
  thresholdHu?: number;
  /** Optional upper HU threshold; by default dense tissue is retained. */
  upperThresholdHu?: number;
  /** Fill internal air cavities (lungs, bowel gas, trachea) to make the volume solid. Default: true */
  fillHoles?: boolean;
  /** Retain largest connected component(s) to eliminate CT couch, cables, positioning foam, and external noise. Default: true */
  removeTableAndNoise?: boolean;
  
  /** Sever thin contact bridge between patient skin and CT couch using morphological opening. Default: true */
  disconnectTableBridge?: boolean;
  /** Radius in mm for morphological closing to smooth skin contour. Default: 2.0 mm */
  closingRadiusMm?: number;
  /** Optional expansion/contraction margin in mm. Default: 0 mm */
  marginMm?: number;
  /** Suppress CT couch/table based on posterior spatial position & flat aspect ratio. Default: true */
  suppressCouch?: boolean;
  /** Regularize skin perimeter to eliminate single-pixel spurs and jagged noise. Default: true */
  smoothSkinPerimeter?: boolean;
}

/**
 * Automatically generates a BODY (External / Contorno Corporal) mask for a single CT slice
 * Combines calibrated HU thresholding, table bridge severing, connected component analysis,
 * couch suppression, hole filling (lungs/bowel), and skin regularization.
 */
export function generateBodyMaskForSlice(slice: DicomSlice, options: BodyContourOptions = {}): Uint8Array {
  const {thresholdHu=-700,upperThresholdHu=Infinity,fillHoles=true,removeTableAndNoise=true,
    disconnectTableBridge=true,closingRadiusMm=2,marginMm=0,suppressCouch=true,
    smoothSkinPerimeter=true,minComponentAreaMm2=20,smoothingRadiusMm=1}=options;
  const tableExclusionRow=options.tableExclusionFraction===undefined?options.tableExclusionRow:options.tableExclusionFraction*slice.rows;
  const {rows,cols,huData,pixelSpacing}=slice;
  if(!pixelSpacing.every(v=>Number.isFinite(v) && v>0))throw new Error('Espaciado de imagen inválido.');
  let mask=new Uint8Array(rows*cols);
  for(let i=0;i<mask.length;i++)mask[i]=huData[i]>=thresholdHu && huData[i]<=upperThresholdHu?1:0;
  const exclusion=tableExclusionRow===undefined?rows:Math.max(0,Math.min(rows,Math.round(tableExclusionRow)));
  mask.fill(0,exclusion*cols);
  if(!hasMaskContour(mask))return mask;
  // A local band only: no global erosion to separate the couch from anatomy.
  if(disconnectTableBridge && suppressCouch && tableExclusionRow===undefined){
    const row=detectBodyTableRow(mask,rows,cols,pixelSpacing);
    if(row!==null){
      const opened=bodyMargin(bodyMargin(mask,rows,cols,pixelSpacing,-2.5),rows,cols,pixelSpacing,2.5);
      const start=Math.max(0,row-Math.ceil(2.5/pixelSpacing[0]));
      const end=Math.min(rows,row+Math.ceil(2.5/pixelSpacing[0]));
      mask.set(opened.subarray(start*cols,end*cols),start*cols);
    }
  }
  if(removeTableAndNoise)mask=filterBodyComponents(mask,slice,minComponentAreaMm2,suppressCouch);
  if(!hasMaskContour(mask))return mask;
  // Close external breaches before filling cavities, and fill again after perimeter regularization.
  if(closingRadiusMm>0){
    const closed=bodyMargin(bodyMargin(mask,rows,cols,pixelSpacing,closingRadiusMm),rows,cols,pixelSpacing,-closingRadiusMm);
    // Closing is extensive: clipping the dilation at the FOV must not erode the original skin.
    for(let i=0;i<mask.length;i++)closed[i] |= mask[i];
    mask=closed;
  }
  if(smoothSkinPerimeter)mask=smoothBody(mask,rows,cols,pixelSpacing,smoothingRadiusMm);
  if(fillHoles)mask=fillEnclosedHolesOnMask(mask,rows,cols);
  if(Math.abs(marginMm)>.05)mask=bodyMargin(mask,rows,cols,pixelSpacing,marginMm);
  mask.fill(0,exclusion*cols);
  return mask;
}

export async function generateBodyVolumeForSeries(
  series: DicomSeries, options: BodyContourOptions = {}, onProgress?: (current:number,total:number)=>void
):Promise<Record<number,Uint8Array>> {
  const result:Record<number,Uint8Array>={}, total=series.slices.length;
  let lastProgress=0;
  const continuity=options.useContinuity!==false && options.removeTableAndNoise!==false;
  for(let i=0;i<total;i++){
    const slice=series.slices[i];
    result[slice.sliceIndex]=generateBodyMaskForSlice(slice,continuity?{...options,minComponentAreaMm2:0}:options);
    const now=performance.now();
    if(i===total-1 || now-lastProgress>100){onProgress?.(i+1,total);lastProgress=now;}
  }
  return continuity?refineBodyContinuity(series.slices,result,options.minComponentAreaMm2??20):result;
}

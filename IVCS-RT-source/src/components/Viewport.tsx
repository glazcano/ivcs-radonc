import {drawFusion} from '../utils/fusionDisplay';
import {ConfigurablePane,defaultPanes,PaneConfig} from './ConfigurablePane';
import {tr} from '../i18n';
import {connectedThreshold} from '../utils/contourEngine';
import {resamplePlane,identity3d,volumeCenter} from '../utils/rigid3d';
import { getRecent, putBounded, bitmapBytes } from '../utils/renderCache';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Maximize2, 
  Play, 
  Pause, 
  Check, 
  X,
  Crosshair,
  Layers,
  Sliders,
  Grid2X2
} from 'lucide-react';
import { 
  DicomSeries, 
  DicomSlice, 
  StructureRoi, 
  ToolType,
  ImageStudy,
  RegistrationState,
  ColorMapType,
  ContourDrawMode,
  MprCoordinates,
  MprViewMode
} from '../types';
import { 
  cloneMask, 
  createEmptyMask,
  getMaskRevision, 
  strokeBrushLine, 
  fillPolygonOnMask,
  createThresholdMask,
  fillEnclosedHolesOnMask,
  strokePathOnMask,
  hasMaskContour,
  getMaskBoundingBox
} from '../utils/contourEngine';
import { renderSliceToCanvas } from '../utils/registrationEngine';
import { MprOrthogonalView } from './MprOrthogonalView';
import { MprControlPanel } from './MprControlPanel';
import { voxelToPatientCoordinates } from '../utils/mprEngine';

interface MaskCanvasEntry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mask: Uint8Array;
  color: string;
  opacity: number;
  cols: number;
  rows: number;
}

interface ViewportProps {
  keyboardDisabled?:boolean;
  series: DicomSeries | null;
  currentSliceIndex: number;
  onSliceChange: (index: number) => void;
  rois: StructureRoi[];
  activeRoi: StructureRoi | null;
  activeTool: ToolType;
  onActiveToolChange?: (tool: ToolType) => void;
  onContourDrawModeChange?:(mode:ContourDrawMode)=>void;
  onFusionOpacityChange?:(value:number)=>void;
  contourDrawMode?: ContourDrawMode;
  brushRadiusMm: number;
  onBrushRadiusChange?: (radiusMm: number) => void;
  windowCenter: number;
  windowWidth: number;
  onWindowChange: (center: number, width: number) => void;
  onUpdateRoiMask: (roiId: string, sliceIndex: number, newMask: Uint8Array, actionName: string) => void;
  huConstraintEnabled: boolean;
  huConstraintMin: number;
  huConstraintMax: number;
  studies?: ImageStudy[];
  registrationState?: RegistrationState;
  onOpenRegistrationModal?: () => void;
}

export const Viewport: React.FC<ViewportProps> = ({
  series,
  currentSliceIndex,
  onSliceChange,
  rois,
  activeRoi,
  activeTool,
  onActiveToolChange, keyboardDisabled,
  contourDrawMode = 'closed', onContourDrawModeChange,onFusionOpacityChange,
  brushRadiusMm,
  onBrushRadiusChange,
  windowCenter,
  windowWidth,
  onWindowChange,
  onUpdateRoiMask,
  huConstraintEnabled,
  huConstraintMin,
  huConstraintMax,
  studies = [],
  registrationState,
  onOpenRegistrationModal
}) => {
  const [detailPlane,setDetailPlane]=useState<'axial'|'coronal'|'sagittal'>('axial');
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1.0);
  const zoomDragRef = useRef<{y:number;zoom:number}|null>(null);
  const fittedSeriesRef = useRef<DicomSeries|null>(null);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number; startWc: number; startWw: number }>({
    x: 0, y: 0, startPanX: 0, startPanY: 0, startWc: 0, startWw: 0
  });

  // Multiplanar Reconstruction (MPR) state
  const [mprViewMode, setMprViewMode] = useState<MprViewMode>('axial');
  const [paneConfigs,setPaneConfigs]=useState<PaneConfig[]>(defaultPanes);
  const [split,setSplit]=useState(65),workspaceRef=useRef<HTMLDivElement>(null);
  const multi=mprViewMode==='triplanar' || mprViewMode==='oneplus2';
  const editorIndex=paneConfigs.slice(0,mprViewMode==='oneplus2'?3:4).findIndex(p=>p.plane==='axial' && p.mode==='reference');
  const editorVisible=mprViewMode==='axial' || (multi && editorIndex>=0);

  const [showCrosshairs, setShowCrosshairs] = useState<boolean>(true);
  const [mprCoords, setMprCoords] = useState<MprCoordinates>({
    x: 256,
    y: 256,
    z: currentSliceIndex
  });

  // Synchronize mprCoords.z with currentSliceIndex
  useEffect(() => {
    setMprCoords(prev => (prev.z === currentSliceIndex ? prev : { ...prev, z: currentSliceIndex }));
  }, [currentSliceIndex]);

  // When series loads, initialize coordinates to center of volume
  useEffect(() => {
    if (series && series.slices.length > 0) {
      const s0 = series.slices[0];
      setMprCoords({
        x: Math.floor((s0.cols || 512) / 2),
        y: Math.floor((s0.rows || 512) / 2),
        z: currentSliceIndex
      });
    }
  }, [series]);

  const handleNavigateCoordinates = useCallback((newCoords: Partial<MprCoordinates>) => {
    setMprCoords(prev => ({ ...prev, ...newCoords }));
    if (newCoords.z !== undefined && newCoords.z !== currentSliceIndex) {
      onSliceChange(newCoords.z);
    }
  }, [currentSliceIndex, onSliceChange]);

  // Cursor Probe HU DOM ref (high-performance direct updates without triggering React component re-renders)
  const probeHudRef = useRef<HTMLDivElement | null>(null);

  // Drawing state
  const isDrawingRef = useRef<boolean>(false);
  const firstDrawCoordRef = useRef<{ x: number; y: number } | null>(null);
  const lastDrawCoordRef = useRef<{ x: number; y: number } | null>(null);
  const currentDraftMaskRef = useRef<Uint8Array | null>(null);
  const draftRenderKeyRef = useRef<{mask: Uint8Array; revision: number; color: string; opacity: number; smooth: boolean; cols: number; rows: number} | null>(null);
  const originalStrokeMaskRef = useRef<Uint8Array | null>(null);

  // Freehand Pencil points (stored in ref for zero-lag tracking without re-rendering)
  const pencilPointsRef = useRef<Array<[number, number]>>([]);

  // Polygon Vertices
  const [polygonPoints, setPolygonPoints] = useState<Array<[number, number]>>([]);
  const polygonRubberBandRef = useRef<[number, number] | null>(null);

  // Reusable zero-allocation mask rendering buffer
  const sharedMaskImageDataRef = useRef<{ imgData: ImageData; data32: Uint32Array; cols: number; rows: number } | null>(null);

  // Ergonomic Smooth Contour Rendering toggle (optical sub-pixel anti-aliasing without modifying underlying voxel data)
  const [smoothContourRendering, setSmoothContourRendering] = useState<boolean>(true);

  // Transient HUD notification when adjusting brush diameter with Shift + Mouse Wheel
  const [brushHudInfo, setBrushHudInfo] = useState<{
    radiusMm: number;
    diameterMm: number;
    visible: boolean;
  }>({ radiusMm: brushRadiusMm, diameterMm: Math.round(brushRadiusMm * 2 * 10) / 10, visible: false });
  const brushHudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ruler state
  const [rulerStart, setRulerStart] = useState<[number, number] | null>(null);
  const [rulerEnd, setRulerEnd] = useState<[number, number] | null>(null);

  // Cine Playback
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // High-performance Offscreen Canvas Caches
  // LRU caches bounded by RGBA bytes, independent of image resolution.
  const ctCanvasCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  // Pre-allocated Windowing Look-Up Table (LUT)
  const ctLutRef = useRef<{ wc: number; ww: number; lut: Uint8Array } | null>(null);

  const maskCacheRef = useRef<Map<string, {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    mask: Uint8Array;
    color: string;
    opacity: number;
    cols: number;
    rows: number;
  }>>(new Map());

  const draftMaskCanvasRef = useRef<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } | null>(null);

  const activeRoiRef = useRef(activeRoi);
  activeRoiRef.current = activeRoi;

  // High-performance cache for co-registered secondary study slices
  const secondaryOffscreenMap = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const getCachedSecondaryCanvas = useCallback((
    secSlice: DicomSlice,
    wc: number,
    ww: number,
    colorMap: ColorMapType
  ): HTMLCanvasElement => {
    const key = `${secSlice.id}_${wc}_${ww}_${colorMap}`;
    const cached = getRecent<string, HTMLCanvasElement>(secondaryOffscreenMap.current, key);
    if (cached) return cached;

    const rendered = renderSliceToCanvas(secSlice, wc, ww, colorMap);
    putBounded(secondaryOffscreenMap.current, key, rendered, 16 * 1024 * 1024, bitmapBytes);
    return rendered;
  }, []);

  useEffect(() => {
    secondaryOffscreenMap.current.clear();
  }, [studies]);

  // Container dimensions observer (prevents hanging caused by layout recalculation loops)
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 600 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const updateSize = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      if (w > 0 && h > 0) {
        setDimensions(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mprViewMode,editorIndex,editorVisible]);

  // Animation frame throttle refs
  const renderRafRef = useRef<number | null>(null);
  const probeRafRef = useRef<number | null>(null);
  const pendingCursorInfoRef = useRef<{ x: number; y: number; hu: number | null } | null>(null);
  const windowDragRafRef = useRef<number | null>(null);
  const pendingWindowRef = useRef<{ wc: number; ww: number } | null>(null);
  const sliceScrollRafRef = useRef<number | null>(null);
  const wheelAccumulatorRef = useRef<number>(0);

  // Real-time Brush / Eraser cursor overlay refs
  const cursorSvgRef = useRef<SVGSVGElement | null>(null);
  const cursorCircleRef = useRef<SVGCircleElement | null>(null);
  const cursorGlowRef = useRef<SVGCircleElement | null>(null);
  const cursorCenterRef = useRef<SVGCircleElement | null>(null);
  const lastPointerPosRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // Track pending slice index during high-frequency scrolling
  const pendingSliceIndexRef = useRef<number>(currentSliceIndex);
  useEffect(() => {
    pendingSliceIndexRef.current = currentSliceIndex;
    isDrawingRef.current = false;
    currentDraftMaskRef.current = null;
    originalStrokeMaskRef.current = null;
  }, [currentSliceIndex, activeRoi?.id, activeTool]);

  // Clean up RAFs and timers on unmount
  useEffect(() => {
    return () => {
      if (renderRafRef.current !== null) cancelAnimationFrame(renderRafRef.current);
      if (probeRafRef.current !== null) cancelAnimationFrame(probeRafRef.current);
      if (windowDragRafRef.current !== null) cancelAnimationFrame(windowDragRafRef.current);
      if (sliceScrollRafRef.current !== null) cancelAnimationFrame(sliceScrollRafRef.current);
      if (brushHudTimeoutRef.current) clearTimeout(brushHudTimeoutRef.current);
    };
  }, []);

  const currentSlice: DicomSlice | undefined = series?.slices[currentSliceIndex];

  // Helper to convert screen coordinates to DICOM image coordinates (0..cols, 0..rows) with subpixel precision
  const screenToImageCoords = useCallback((screenX: number, screenY: number): { x: number; y: number } | null => {
    if (!canvasRef.current || !currentSlice) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    // Convert screen client coordinates to canvas internal bitmap coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasBmpX = (screenX - rect.left) * scaleX;
    const canvasBmpY = (screenY - rect.top) * scaleY;

    // Viewport transform in canvas bitmap space: canvas center + pan, scaled by zoom
    const centerX = canvas.width / 2 + pan.x;
    const centerY = canvas.height / 2 + pan.y;

    const imgX = (canvasBmpX - centerX) / zoom + currentSlice.cols / 2;
    const imgY = (canvasBmpY - centerY) / (zoom * currentSlice.pixelSpacing[0] / currentSlice.pixelSpacing[1]) + currentSlice.rows / 2;

    return {
      x: imgX,
      y: imgY
    };
  }, [currentSlice, pan.x, pan.y, zoom]);

  // Handle Cine loop
  useEffect(() => {
    if (!isPlaying || !series || series.slices.length <= 1) return;
    const timer = setInterval(() => {
      onSliceChange((currentSliceIndex + 1) % series.slices.length);
    }, 150);
    return () => clearInterval(timer);
  }, [isPlaying, currentSliceIndex, series, onSliceChange]);

  // Fit image to canvas viewport
  const handleResetView = useCallback(() => {
    if (!canvasRef.current || !currentSlice) {
      setZoom(1.0);
      setPan({ x: 0, y: 0 });
      return;
    }
    const { clientWidth, clientHeight } = canvasRef.current!;
    const scale = Math.min(
      (clientWidth - 40) / currentSlice.cols,
      (clientHeight - 40) / (currentSlice.rows * currentSlice.pixelSpacing[0] / currentSlice.pixelSpacing[1])
    );
    setZoom(Math.max(0.2, Math.min(scale, 3.0)));
    setPan({ x: 0, y: 0 });
  }, [currentSlice]);

  // Initial fit when slice loads first time
  useEffect(() => {
    if (currentSlice && series && fittedSeriesRef.current !== series && canvasRef.current?.clientWidth) {
      fittedSeriesRef.current = series;
      handleResetView();
    }
  }, [series, currentSlice, handleResetView]);

  // Helper: Renders mask to context with 4-neighborhood boundary line or 17-level sub-pixel anti-aliased profile
  const renderMaskToContext = useCallback((
    mask: Uint8Array,
    color: string,
    opacity: number,
    cols: number,
    rows: number,
    targetCtx: CanvasRenderingContext2D,
    isDraft: boolean = false,
    smoothBorders: boolean = true
  ) => {
    let shared = sharedMaskImageDataRef.current;
    if (!shared || shared.cols !== cols || shared.rows !== rows) {
      const imgData = targetCtx.createImageData(cols, rows);
      shared = {
        imgData,
        data32: new Uint32Array(imgData.data.buffer),
        cols,
        rows
      };
      sharedMaskImageDataRef.current = shared;
    }

    const { imgData, data32 } = shared;
    data32.fill(0);

    const hex = color.replace('#', '');
    const rVal = parseInt(hex.substring(0, 2), 16) || 0;
    const gVal = parseInt(hex.substring(2, 4), 16) || 0;
    const bVal = parseInt(hex.substring(4, 6), 16) || 0;

    const fillAlpha = Math.round(opacity * 255);
    const borderAlpha = 255;

    const fillColor = (fillAlpha << 24) | (bVal << 16) | (gVal << 8) | rVal;
    const borderColor = (borderAlpha << 24) | (bVal << 16) | (gVal << 8) | rVal;

    // Use cached bounding box to constrain processing window
    const bbox = getMaskBoundingBox(mask, rows, cols);
    if (!bbox) {
      targetCtx.putImageData(imgData, 0, 0);
      return;
    }

    if (smoothBorders) {
      // Sub-pixel anti-aliased contour profile
      // Precompute 17-level LUT: sum in [0..16]
      const lut32 = new Uint32Array(17);
      lut32[0] = 0; // completely outside
      for (let s = 1; s <= 16; s++) {
        if (s === 16) {
          lut32[16] = fillColor;
        } else {
          // Continuous hat filter peaked at s=8 (the exact edge boundary)
          const edgeDist = Math.abs(s - 8);
          const edgeFactor = Math.max(0, (8 - edgeDist) / 8); // 0.125 .. 1.0
          const edgeA = Math.round(borderAlpha * edgeFactor);
          const fillA = Math.round(fillAlpha * (s / 16));
          const finalA = Math.min(255, Math.max(edgeA, fillA));
          lut32[s] = (finalA << 24) | (bVal << 16) | (gVal << 8) | rVal;
        }
      }

      const startR = Math.max(1, bbox.minR - 1);
      const endR = Math.min(rows - 2, bbox.maxR + 1);
      const startC = Math.max(1, bbox.minC - 1);
      const endC = Math.min(cols - 2, bbox.maxC + 1);

      // Outer boundary rows/columns
      if (bbox.minR === 0) {
        for (let c = 0; c < cols; c++) {
          if (mask[c] === 1) data32[c] = borderColor;
        }
      }
      if (bbox.maxR === rows - 1) {
        const lastRowOffset = (rows - 1) * cols;
        for (let c = 0; c < cols; c++) {
          if (mask[lastRowOffset + c] === 1) data32[lastRowOffset + c] = borderColor;
        }
      }
      if (bbox.minC === 0) {
        for (let r = startR; r <= endR; r++) {
          if (mask[r * cols] === 1) data32[r * cols] = borderColor;
        }
      }
      if (bbox.maxC === cols - 1) {
        const lastCol = cols - 1;
        for (let r = startR; r <= endR; r++) {
          if (mask[r * cols + lastCol] === 1) data32[r * cols + lastCol] = borderColor;
        }
      }

      // Interior bounded rows
      for (let r = startR; r <= endR; r++) {
        const rOffset = r * cols;
        const prevOffset = (r - 1) * cols;
        const nextOffset = (r + 1) * cols;

        for (let c = startC; c <= endC; c++) {
          const center = mask[rOffset + c];
          const left = mask[rOffset + c - 1];
          const right = mask[rOffset + c + 1];
          const top = mask[prevOffset + c];
          const bottom = mask[nextOffset + c];

          const orthoSum = left + right + top + bottom;

          if (center === 0 && orthoSum === 0) {
            // Check diagonal corners for smooth corner continuity
            const tl = mask[prevOffset + c - 1];
            const tr = mask[prevOffset + c + 1];
            const bl = mask[nextOffset + c - 1];
            const br = mask[nextOffset + c + 1];
            const diagSum = tl + tr + bl + br;
            if (diagSum > 0) {
              data32[rOffset + c] = lut32[diagSum];
            }
          } else {
            const tl = mask[prevOffset + c - 1];
            const tr = mask[prevOffset + c + 1];
            const bl = mask[nextOffset + c - 1];
            const br = mask[nextOffset + c + 1];
            const sum = 4 * center + 2 * orthoSum + (tl + tr + bl + br);
            data32[rOffset + c] = lut32[sum];
          }
        }
      }
    } else {
      // Discrete 4-neighborhood exact voxel border
      const is32Aligned = (mask.byteOffset % 4 === 0) && ((cols & 3) === 0);
      const u32Cols = cols >> 2;
      const mask32 = is32Aligned ? new Uint32Array(mask.buffer, mask.byteOffset, mask.byteLength >> 2) : null;

      // Row 0 (boundary row)
      if (bbox.minR === 0) {
        for (let c = 0; c < cols; c++) {
          if (mask[c] === 1) data32[c] = borderColor;
        }
      }

      // Rows 1 to rows - 2 (bounded by bbox)
      const startR = Math.max(1, bbox.minR);
      const endR = Math.min(rows - 2, bbox.maxR);
      for (let r = startR; r <= endR; r++) {
        const rOffset = r * cols;
        const r32Offset = r * u32Cols;

        // Fast check if row has any pixels using 32-bit words if aligned
        let rowHasPixels = false;
        if (mask32) {
          for (let k = 0; k < u32Cols; k++) {
            if (mask32[r32Offset + k] !== 0) {
              rowHasPixels = true;
              break;
            }
          }
        } else {
          for (let c = 0; c < cols; c++) {
            if (mask[rOffset + c] !== 0) {
              rowHasPixels = true;
              break;
            }
          }
        }
        if (!rowHasPixels) continue;

        // Left boundary pixel (c = 0)
        if (mask[rOffset] === 1) {
          data32[rOffset] = borderColor;
        }

        // Interior pixels: branch-free 4-neighbor check
        const startC = Math.max(1, bbox.minC);
        const endC = Math.min(cols - 2, bbox.maxC);
        for (let c = startC; c <= endC; c++) {
          const idx = rOffset + c;
          if (mask[idx] === 1) {
            const isBorder = (
              mask[idx - 1] === 0 || mask[idx + 1] === 0 ||
              mask[idx - cols] === 0 || mask[idx + cols] === 0
            );
            data32[idx] = isBorder ? borderColor : fillColor;
          }
        }

        // Right boundary pixel (c = cols - 1)
        const rightIdx = rOffset + (cols - 1);
        if (mask[rightIdx] === 1) {
          data32[rightIdx] = borderColor;
        }
      }

      // Row rows - 1 (boundary row)
      if (bbox.maxR === rows - 1) {
        const lastRowOffset = (rows - 1) * cols;
        for (let c = 0; c < cols; c++) {
          if (mask[lastRowOffset + c] === 1) data32[lastRowOffset + c] = borderColor;
        }
      }
    }

    targetCtx.putImageData(imgData, 0, 0);
  }, []);

  // Fast Windowing Look-Up Table (LUT) with size 8192 for full CT range (-2048 to +6144 HU)
  const getCtLut = useCallback((wc: number, ww: number): Uint8Array => {
    if (ctLutRef.current && ctLutRef.current.wc === wc && ctLutRef.current.ww === ww) {
      return ctLutRef.current.lut;
    }
    const OFFSET = 2048;
    const SIZE = 8192;
    const lut = new Uint8Array(SIZE);
    const minVal = wc - ww / 2;
    const maxVal = wc + ww / 2;
    const wwInv = ww > 0 ? 255.0 / ww : 1;

    for (let hu = -OFFSET; hu < SIZE - OFFSET; hu++) {
      let gray: number;
      if (hu <= minVal) {
        gray = 0;
      } else if (hu >= maxVal) {
        gray = 255;
      } else {
        gray = (((hu - minVal) * wwInv) + 0.5) | 0;
      }
      lut[hu + OFFSET] = gray > 255 ? 255 : (gray < 0 ? 0 : gray);
    }

    ctLutRef.current = { wc, ww, lut };
    return lut;
  }, []);

  // Ultra-fast slice rasterizer using precomputed LUT (sub-millisecond execution)
  const renderSliceToCanvasFast = useCallback((
    slice: DicomSlice,
    wc: number,
    ww: number
  ): HTMLCanvasElement => {
    const cols = slice.cols;
    const rows = slice.rows;
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    const imgData = ctx.createImageData(cols, rows);
    const data32 = new Uint32Array(imgData.data.buffer);
    const huData = slice.huData;
    const len = huData.length;
    const lut = getCtLut(wc, ww);
    const OFFSET = 2048;

    for (let i = 0; i < len; i++) {
      const hu = huData[i];
      const lutIdx = hu + OFFSET;
      let gray = (Number.isInteger(lutIdx) && lutIdx >= 0 && lutIdx < 8192)
        ? lut[lutIdx]
        : Math.max(0,Math.min(255,Math.round((hu-wc)/Math.max(1e-12,ww)*255+127.5)));
      if(slice.inverted)gray=255-gray;
      if(slice.valid && !slice.valid[i])gray=0;
      data32[i] = 0xFF000000 | (gray << 16) | (gray << 8) | gray;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }, [getCtLut]);

  // Helper: Get or render cached CT slice canvas from Multi-slice LRU Cache
  const getCachedCtCanvas = useCallback((
    slice: DicomSlice,
    wc: number,
    ww: number
  ): HTMLCanvasElement => {
    const key = `${slice.id || slice.sliceIndex}_${wc}_${ww}`;
    const cached = getRecent<string, HTMLCanvasElement>(ctCanvasCacheRef.current, key);
    if (cached) return cached;

    const canvas = renderSliceToCanvasFast(slice, wc, ww);

    putBounded(ctCanvasCacheRef.current, key, canvas, 32 * 1024 * 1024, bitmapBytes);

    return canvas;
  }, [renderSliceToCanvasFast]);

  // Invalidate CT slice canvas cache when window center/width changes
  useEffect(() => {
    ctCanvasCacheRef.current.clear();
    ctLutRef.current = null;
  }, [windowCenter, windowWidth, series]);

  // Warm only nearby CT slices. Skip background rendering during active strokes;
  // ROI canvases are generated on demand instead of filling the cache with remote slices.
  useEffect(() => {
    if (!series) return;
    const neighbors: DicomSlice[] = [];
    for (let d=1; d<=4; d++) {
      if (series.slices[currentSliceIndex+d]) neighbors.push(series.slices[currentSliceIndex+d]);
      if (series.slices[currentSliceIndex-d]) neighbors.push(series.slices[currentSliceIndex-d]);
    }
    let timer: ReturnType<typeof setTimeout>;
    let index=0;
    const warm = () => {
      if (!isDrawingRef.current && index < neighbors.length) getCachedCtCanvas(neighbors[index++],windowCenter,windowWidth);
      if (index < neighbors.length) timer=setTimeout(warm,50);
    };
    timer=setTimeout(warm,50);
    return ()=>clearTimeout(timer);
  }, [series,currentSliceIndex,windowCenter,windowWidth,getCachedCtCanvas]);

  // Invalidate ROI mask canvas cache when smoothContourRendering changes
  useEffect(() => {
    maskCacheRef.current.clear();
    renderCanvas();
  }, [smoothContourRendering, series]);

  // Helper: Get or render cached ROI mask canvas
  const getCachedRoiMaskCanvas = useCallback((
    roiId: string,
    mask: Uint8Array,
    color: string,
    opacity: number,
    cols: number,
    rows: number,
    isDraft: boolean = false
  ): HTMLCanvasElement | null => {
    if (isDraft) {
      if (!draftMaskCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = cols;
        c.height = rows;
        draftMaskCanvasRef.current = {
          canvas: c,
          ctx: c.getContext('2d')!
        };
      }
      const { canvas, ctx } = draftMaskCanvasRef.current;
      if (canvas.width !== cols || canvas.height !== rows) {
        canvas.width = cols;
        canvas.height = rows;
      }
      const revision = getMaskRevision(mask);
      const previous = draftRenderKeyRef.current;
      if (previous && previous.mask === mask && previous.revision === revision && previous.color === color && previous.opacity === opacity && previous.smooth === smoothContourRendering && previous.cols === cols && previous.rows === rows) return canvas;
      draftRenderKeyRef.current = {mask, revision, color, opacity, smooth: smoothContourRendering, cols, rows};
      renderMaskToContext(mask, color, opacity, cols, rows, ctx, true, smoothContourRendering);
      return canvas;
    }

    const cacheKey = `${roiId}_${currentSliceIndex}_${smoothContourRendering ? 's' : 'r'}`;
    const existing = getRecent<string, MaskCanvasEntry>(maskCacheRef.current, cacheKey);

    if (
      existing &&
      existing.mask === mask &&
      existing.color === color &&
      existing.opacity === opacity &&
      existing.cols === cols &&
      existing.rows === rows
    ) {
      return existing.canvas;
    }

    // Fast check: Skip 262k voxel border loop if mask has no contours on this slice
    if (!hasMaskContour(mask)) {
      return null;
    }

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;

    if (existing) {
      canvas = existing.canvas;
      if (canvas.width !== cols || canvas.height !== rows) {
        canvas.width = cols;
        canvas.height = rows;
      }
      ctx = existing.ctx;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      ctx = canvas.getContext('2d')!;
    }

    renderMaskToContext(mask, color, opacity, cols, rows, ctx, false, smoothContourRendering);

    putBounded(maskCacheRef.current, cacheKey, {
      canvas, ctx, mask, color, opacity, cols, rows
    }, 64 * 1024 * 1024, entry => bitmapBytes(entry.canvas));

    return canvas;
  }, [currentSliceIndex, renderMaskToContext, smoothContourRendering]);

  // Main Render Loop: draws cached CT slice + secondary fusion + structure contours + active drawing previews
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSlice) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) return;

    // Clear background to PACS dark
    ctx.fillStyle = '#06090e';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Center of viewport
    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;

    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom * currentSlice.pixelSpacing[0] / currentSlice.pixelSpacing[1]);
    ctx.translate(-currentSlice.cols / 2, -currentSlice.rows / 2);

    // Interpolate display pixels only; source voxels and contour masks stay unchanged.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const cols = currentSlice.cols;
    const rows = currentSlice.rows;

    // 1. Draw cached CT Grayscale Image (instant drawImage, no pixel recalculation during pan/zoom/probe)
    const ctCanvas = getCachedCtCanvas(currentSlice, windowCenter, windowWidth);
    ctx.drawImage(ctCanvas, 0, 0);

    // 1.5 Draw Coregistered Secondary Study if active
    if (registrationState?.active && !multi) {
      const secStudy = studies.find(s => s.id === registrationState.secondaryStudyId);
      if (secStudy && secStudy.slices.length > 0) {
        const transform = registrationState.transforms[secStudy.id]?.model==='rigid3d' ? registrationState.transforms[secStudy.id] : identity3d(volumeCenter(secStudy));
        const fusionKey = `${secStudy.id}_${currentSlice.id}_${JSON.stringify(transform)}_${registrationState.secondaryWindowCenter}_${registrationState.secondaryWindowWidth}_${registrationState.secondaryColorMap}`;
        let secCanvas = getRecent<string,HTMLCanvasElement>(secondaryOffscreenMap.current,fusionKey);
        if(!secCanvas){
          const secSlice=resamplePlane(currentSlice,secStudy,transform);
          secCanvas=renderSliceToCanvas(secSlice,registrationState.secondaryWindowCenter,registrationState.secondaryWindowWidth,registrationState.secondaryColorMap);
          putBounded(secondaryOffscreenMap.current,fusionKey,secCanvas,16*1024*1024,bitmapBytes);
        }
        if (secCanvas) {
          drawFusion(ctx,secCanvas,registrationState);
        }
      }
    }

    // 1.8 Draw Volume of Interest (VOI) Bounding Box if enabled
    if (registrationState?.showVoiOverlay && registrationState.voi.enabled) {
      const voi = registrationState.voi;
      const isSliceInVoi = currentSliceIndex >= voi.minSlice && currentSliceIndex <= voi.maxSlice;
      if (isSliceInVoi) {
        ctx.save();
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);
        const voiW = Math.max(10, voi.maxX - voi.minX);
        const voiH = Math.max(10, voi.maxY - voi.minY);
        ctx.strokeRect(voi.minX, voi.minY, voiW, voiH);

        // Corner brackets for clinical precision
        const bLen = Math.min(18, voiW / 4);
        ctx.setLineDash([]);
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(voi.minX, voi.minY + bLen);
        ctx.lineTo(voi.minX, voi.minY);
        ctx.lineTo(voi.minX + bLen, voi.minY);
        // Top-right
        ctx.moveTo(voi.maxX - bLen, voi.minY);
        ctx.lineTo(voi.maxX, voi.minY);
        ctx.lineTo(voi.maxX, voi.minY + bLen);
        // Bottom-left
        ctx.moveTo(voi.minX, voi.maxY - bLen);
        ctx.lineTo(voi.minX, voi.maxY);
        ctx.lineTo(voi.minX + bLen, voi.maxY);
        // Bottom-right
        ctx.moveTo(voi.maxX - bLen, voi.maxY);
        ctx.lineTo(voi.maxX, voi.maxY);
        ctx.lineTo(voi.maxX, voi.maxY - bLen);
        ctx.stroke();

        // High-contrast label tag
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(voi.minX, voi.minY - 18 / zoom, 130 / zoom, 16 / zoom);
        ctx.fillStyle = '#F59E0B';
        ctx.font = `${Math.max(9, Math.round(10 / zoom))}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`VOI COREGISTRO`, voi.minX + 4 / zoom, voi.minY - 9 / zoom);
        ctx.restore();
      }
    }

    ctx.imageSmoothingEnabled = false;
    // 2. Render Structure Overlays (Masks and Outlines) from offscreen cache
    for (const roi of rois) {
      if (!roi.visible) continue;

      const currentActiveRoi = activeRoiRef.current;
      const isDraft = Boolean(currentActiveRoi && roi.id === currentActiveRoi.id && currentDraftMaskRef.current);
      const mask = isDraft ? currentDraftMaskRef.current : roi.sliceMasks[currentSliceIndex];
      if (!mask) continue;

      // When actively erasing, render the original pre-stroke contour as a subtle ghost reference line (35% opacity)
      // so the user can see both the original boundary and the live boundary being trimmed in real time
      if (isDraft && activeTool === 'eraser' && originalStrokeMaskRef.current) {
        const ghostCanvas = getCachedRoiMaskCanvas(
          `${roi.id}_orig_erase`,
          originalStrokeMaskRef.current,
          roi.color,
          0, // line-only for the original reference
          cols,
          rows,
          false
        );
        if (ghostCanvas) {
          ctx.save();
          ctx.globalAlpha = 0.35;
          if (smoothContourRendering) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(ghostCanvas, 0, 0);
            ctx.imageSmoothingEnabled = false;
          } else {
            ctx.drawImage(ghostCanvas, 0, 0);
          }
          ctx.restore();
        }
      }

      const maskCanvas = getCachedRoiMaskCanvas(
        roi.id,
        mask,
        roi.color,
        roi.opacity,
        cols,
        rows,
        isDraft
      );
      if (maskCanvas) {
        if (smoothContourRendering) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(maskCanvas, 0, 0);
          ctx.imageSmoothingEnabled = false;
        } else {
          ctx.drawImage(maskCanvas, 0, 0);
        }
      }
    }

    // 3. Render Live Freehand Pencil Stroke Preview
    const pPts = pencilPointsRef.current;
    if (pPts.length > 1) {
      ctx.save();
      ctx.strokeStyle = activeRoiRef.current ? activeRoiRef.current.color : '#F59E0B';
      const strokeRadiusPx = Math.max(1, Math.round(brushRadiusMm / (currentSlice?.pixelSpacing[1] || 1)));
      ctx.lineWidth = Math.max(2, strokeRadiusPx * 2) / zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pPts[0][0], pPts[0][1]);
      for (let i = 1; i < pPts.length; i++) {
        ctx.lineTo(pPts[i][0], pPts[i][1]);
      }
      if (contourDrawMode === 'closed' && pPts.length >= 3) {
        ctx.closePath();
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4. Render Live Polygon Vertices & Rubber-band Line
    if (polygonPoints.length > 0) {
      const activeColor = activeRoiRef.current ? activeRoiRef.current.color : '#3B82F6';
      ctx.strokeStyle = activeColor;
      ctx.fillStyle = activeColor;
      ctx.lineWidth = 1.5 / zoom;

      // Draw lines between existing points
      ctx.beginPath();
      ctx.moveTo(polygonPoints[0][0], polygonPoints[0][1]);
      for (let i = 1; i < polygonPoints.length; i++) {
        ctx.lineTo(polygonPoints[i][0], polygonPoints[i][1]);
      }

      // Rubberband line to current mouse cursor
      if (polygonRubberBandRef.current) {
        ctx.lineTo(polygonRubberBandRef.current[0], polygonRubberBandRef.current[1]);
      }
      ctx.stroke();

      // Draw vertex dots
      for (let i = 0; i < polygonPoints.length; i++) {
        const pt = polygonPoints[i];
        ctx.beginPath();
        const ptRadius = i === 0 ? 4.5 / zoom : 3 / zoom;
        ctx.arc(pt[0], pt[1], ptRadius, 0, Math.PI * 2);
        ctx.fill();
        if (i === 0) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
        }
      }
    }

    // 5. Render Ruler / Measurement
    if (rulerStart && rulerEnd) {
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([4 / zoom, 2 / zoom]);
      ctx.beginPath();
      ctx.moveTo(rulerStart[0], rulerStart[1]);
      ctx.lineTo(rulerEnd[0], rulerEnd[1]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Calculate distance in mm
      const dxPx = rulerEnd[0] - rulerStart[0];
      const dyPx = rulerEnd[1] - rulerStart[1];
      const distPx = Math.hypot(dxPx, dyPx);
      const distMm = Math.hypot(dxPx * currentSlice.pixelSpacing[1], dyPx * currentSlice.pixelSpacing[0]);

      // Draw distance label
      const midX = (rulerStart[0] + rulerEnd[0]) / 2;
      const midY = (rulerStart[1] + rulerEnd[1]) / 2;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(midX - 30 / zoom, midY - 12 / zoom, 60 / zoom, 16 / zoom);
      ctx.fillStyle = '#34D399';
      ctx.font = `${Math.max(10, Math.round(11 / zoom))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${distMm.toFixed(1)} mm`, midX, midY - 4 / zoom);
    }

    // 6. Render Crosshairs for MPR navigation (Coronal Y in Emerald, Sagittal X in Amber)
    if (showCrosshairs && currentSlice) {
      ctx.save();
      ctx.lineWidth = 1 / zoom;

      // Vertical line: Sagittal plane (X)
      const sagX = Math.max(0, Math.min(currentSlice.cols - 1, mprCoords.x));
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)'; // Amber
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.moveTo(sagX, 0);
      ctx.lineTo(sagX, currentSlice.rows);
      ctx.stroke();

      // Horizontal line: Coronal plane (Y)
      const corY = Math.max(0, Math.min(currentSlice.rows - 1, mprCoords.y));
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)'; // Emerald
      ctx.beginPath();
      ctx.moveTo(0, corY);
      ctx.lineTo(currentSlice.cols, corY);
      ctx.stroke();

      // Intersection center marker
      ctx.setLineDash([]);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(sagX, corY, 4 / zoom, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();
  }, [
    currentSlice, 
    rois, 
    currentSliceIndex, 
    windowCenter, 
    windowWidth, 
    pan.x, 
    pan.y, 
    zoom, 
    polygonPoints, 
    rulerStart, 
    rulerEnd,
    getCachedCtCanvas,
    getCachedRoiMaskCanvas,
    studies,
    registrationState,
    multi,
    getCachedSecondaryCanvas,
    showCrosshairs,
    mprCoords.x,
    mprCoords.y
  ]);

  // Re-render when dependencies or dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && (canvas.width !== dimensions.width || canvas.height !== dimensions.height)) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
    }
    renderCanvas();
  }, [renderCanvas, dimensions,mprViewMode,editorIndex,editorVisible]);

  // Trigger redraw on activeRoi change ONLY if there are active drawing preview points or draft mask
  useEffect(() => {
    if (pencilPointsRef.current.length > 0 || polygonPoints.length > 0 || currentDraftMaskRef.current) {
      renderCanvas();
    }
  }, [activeRoi, polygonPoints.length, renderCanvas]);

  // Ultra-responsive zero-re-render cursor brush thickness overlay updater
  const updateCursorOverlay = useCallback((clientX: number, clientY: number, overrideRadiusMm?: number) => {
    lastPointerPosRef.current = { clientX, clientY };
    if (!canvasRef.current || !cursorSvgRef.current) return;

    if (activeTool !== 'brush' && activeTool !== 'eraser') {
      cursorSvgRef.current.style.display = 'none';
      return;
    }

    const canvas = canvasRef.current;
    const canvasRect = canvas.getBoundingClientRect();
    const svgRect = cursorSvgRef.current.getBoundingClientRect();

    if (
      clientX < canvasRect.left ||
      clientX > canvasRect.right ||
      clientY < canvasRect.top ||
      clientY > canvasRect.bottom
    ) {
      cursorSvgRef.current.style.display = 'none';
      return;
    }

    // Position relative to the SVG element's origin so it exactly follows the pointer
    const svgX = clientX - svgRect.left;
    const svgY = clientY - svgRect.top;

    const pixelSpacing = currentSlice?.pixelSpacing[1] || 1;
    // Scale from image pixels to screen CSS pixels:
    const effectiveRadius = overrideRadiusMm !== undefined ? overrideRadiusMm : brushRadiusMm;
    const scaleToScreen = canvasRect.width > 0 && canvas.width > 0 ? canvasRect.width / canvas.width : 1;
    const screenRadius = (effectiveRadius / pixelSpacing) * zoom * scaleToScreen;

    const isEraser = activeTool === 'eraser';
    const strokeColor = isEraser ? '#EF4444' : (activeRoi?.color || '#3B82F6');
    // Ultra-light fill ensures complete visibility of CT anatomy under the brush stamp
    const fillColor = isEraser ? 'rgba(239, 68, 68, 0.08)' : `${strokeColor}14`;

    cursorSvgRef.current.style.display = 'block';

    if (cursorCircleRef.current) {
      cursorCircleRef.current.setAttribute('cx', String(svgX));
      cursorCircleRef.current.setAttribute('cy', String(svgY));
      cursorCircleRef.current.setAttribute('r', String(Math.max(1, screenRadius)));
      cursorCircleRef.current.setAttribute('stroke', strokeColor);
      cursorCircleRef.current.setAttribute('fill', fillColor);
      if (isEraser) {
        cursorCircleRef.current.setAttribute('stroke-dasharray', '4 2');
      } else {
        cursorCircleRef.current.removeAttribute('stroke-dasharray');
      }
    }

    if (cursorGlowRef.current) {
      cursorGlowRef.current.setAttribute('cx', String(svgX));
      cursorGlowRef.current.setAttribute('cy', String(svgY));
      cursorGlowRef.current.setAttribute('r', String(Math.max(1, screenRadius)));
    }

    if (cursorCenterRef.current) {
      cursorCenterRef.current.setAttribute('cx', String(svgX));
      cursorCenterRef.current.setAttribute('cy', String(svgY));
    }
  }, [activeTool, currentSlice, brushRadiusMm, zoom, activeRoi]);

  // Synchronize cursor overlay whenever tool, radius, zoom, or active ROI changes
  useEffect(() => {
    if (lastPointerPosRef.current && (activeTool === 'brush' || activeTool === 'eraser')) {
      updateCursorOverlay(lastPointerPosRef.current.clientX, lastPointerPosRef.current.clientY);
    } else if (activeTool !== 'brush' && activeTool !== 'eraser') {
      if (cursorSvgRef.current) cursorSvgRef.current.style.display = 'none';
    }
  }, [updateCursorOverlay, activeTool, brushRadiusMm, zoom, activeRoi]);

  // Mouse Down Event Handler
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentSlice) return;

    // Refresh cursor overlay at mouse position
    updateCursorOverlay(e.clientX, e.clientY);

    const isRightClick = e.button === 2;
    const isMiddleClick = e.button === 1;

    // Right click initiates interactive Window/Level adjustment
    if (isRightClick || activeTool === 'window') {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        startWc: windowCenter,
        startWw: windowWidth
      };
      return;
    }

    // Middle click or Pan tool initiates panning
    if (isMiddleClick || activeTool === 'pan' || (e.altKey && e.button === 0)) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        startWc: windowCenter,
        startWw: windowWidth
      };
      return;
    }

    // Zoom is a navigation gesture and does not require an editable ROI.
    if (activeTool === 'zoom' && e.button === 0) {
      e.preventDefault();
      zoomDragRef.current = {y:e.clientY,zoom};
      return;
    }

    // Ruler tool
    if (activeTool === 'ruler') {
      const coords = screenToImageCoords(e.clientX, e.clientY);
      if (coords) {
        setRulerStart([coords.x, coords.y]);
        setRulerEnd([coords.x, coords.y]);
      }
      return;
    }

    // Contouring Tools require an active unlocked ROI
    if (['brush', 'pencil', 'polygon', 'eraser', 'threshold'].includes(activeTool)) {
      if (!activeRoi) return;
      if (activeRoi.locked) {
        alert(tr("La estructura \"{0}\" está bloqueada.", [activeRoi.name]));
        return;
      }

      const coords = screenToImageCoords(e.clientX, e.clientY);
      if (!coords) return;

      const rows = currentSlice.rows;
      const cols = currentSlice.cols;
      const radiusPx = Math.max(0.5, brushRadiusMm / (currentSlice.pixelSpacing[1] || 1.0));

      // 1. Brush & Eraser
      if (activeTool === 'brush' || activeTool === 'eraser') {
        setIsPlaying(false);
        isDrawingRef.current = true;
        const currentMask = (activeRoi.sliceMasks[currentSliceIndex] || createEmptyMask(rows, cols));
        originalStrokeMaskRef.current = currentMask;
        const draft = cloneMask(currentMask);
        currentDraftMaskRef.current = draft;
        firstDrawCoordRef.current = { x: coords.x, y: coords.y };
        lastDrawCoordRef.current = { x: coords.x, y: coords.y };

        const drawValue: 0 | 1 = activeTool === 'brush' ? 1 : 0;
        const huThreshold = huConstraintEnabled ? { min: huConstraintMin, max: huConstraintMax } : undefined;

        strokeBrushLine(
          draft,
          rows,
          cols,
          coords.x,
          coords.y,
          coords.x,
          coords.y,
          radiusPx,
          drawValue,
          currentSlice.huData,
          huThreshold, currentSlice.pixelSpacing[1] / currentSlice.pixelSpacing[0]
        );
        renderCanvas();
      }

      // 2. Freehand Pencil
      else if (activeTool === 'pencil') {
        setIsPlaying(false);
        isDrawingRef.current = true;
        pencilPointsRef.current = [[coords.x, coords.y]];
        renderCanvas();
      }

      // 3. Polygon Tool
      else if (activeTool === 'polygon') {
        // If clicking near first vertex, finish polygon!
        if (polygonPoints.length >= 3) {
          const first = polygonPoints[0];
          const distToFirst = Math.hypot(coords.x - first[0], coords.y - first[1]);
          if (distToFirst <= Math.max(8, 6 / zoom)) {
            finishPolygon();
            return;
          }
        }
        setPolygonPoints(prev => [...prev, [coords.x, coords.y]]);
      }

      // 4. Threshold Tool (segment HU range)
      else if (activeTool === 'threshold') {
        const pixelX = Math.floor(coords.x);
        const pixelY = Math.floor(coords.y);
        if (pixelX >= 0 && pixelX < cols && pixelY >= 0 && pixelY < rows) {
          const clickedIdx = pixelY * cols + pixelX;
          const clickedHU = currentSlice.huData[clickedIdx];
          if (clickedHU !== undefined) {
            const minRange = huConstraintEnabled ? huConstraintMin : clickedHU - 50;
            const maxRange = huConstraintEnabled ? huConstraintMax : clickedHU + 50;
            const newMask = connectedThreshold(currentSlice.huData, rows, cols, clickedIdx, minRange, maxRange);
            onUpdateRoiMask(activeRoi.id, currentSliceIndex, newMask, `Umbral HU [${minRange}, ${maxRange}]`);
          }
        }
      }
    }
  };

  // Mouse Move Event Handler
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    // Continuously update brush/eraser cursor position & size
    updateCursorOverlay(e.clientX, e.clientY);

    if (!currentSlice) return;

    const coords = screenToImageCoords(e.clientX, e.clientY);
    if (coords) {
      const pixelX = Math.floor(coords.x);
      const pixelY = Math.floor(coords.y);
      if (pixelX >= 0 && pixelX < currentSlice.cols && pixelY >= 0 && pixelY < currentSlice.rows) {
        const idx = pixelY * currentSlice.cols + pixelX;
        const hu = currentSlice.huData[idx];
        pendingCursorInfoRef.current = { x: pixelX, y: pixelY, hu };
      } else {
        pendingCursorInfoRef.current = null;
      }
    } else {
      pendingCursorInfoRef.current = null;
    }

    // Throttle cursor probe HUD updates to 60fps directly via DOM ref to eliminate React re-render cascades
    if (probeRafRef.current === null) {
      probeRafRef.current = requestAnimationFrame(() => {
        probeRafRef.current = null;
        const el = probeHudRef.current;
        if (!el) return;
        const info = pendingCursorInfoRef.current;
        if (info && info.hu !== null) {
          el.textContent = tr('Coordenadas: {0}, {1} · {2}: {3}',[info.x,info.y,currentSlice?.units || tr('Valor'),Number(info.hu).toLocaleString(undefined,{maximumFractionDigits:6})]);
        } else {
          el.innerHTML = `<div class="text-[#777]"></div>`;
        }
      });
    }

    if (zoomDragRef.current) {
      const start=zoomDragRef.current;
      setZoom(Math.max(.2,Math.min(6,start.zoom*Math.exp((start.y-e.clientY)*.01))));
      return;
    }

    // 1. Pan or Windowing drag
    if (isDragging) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      if (e.buttons === 2 || activeTool === 'window') {
        // Adjust Window Width with dx, Window Center with -dy (throttled to RAF)
        const newWw = Math.max(1, Math.round(dragStartRef.current.startWw + dx * 2));
        const newWc = Math.round(dragStartRef.current.startWc - dy * 2);
        pendingWindowRef.current = { wc: newWc, ww: newWw };

        if (windowDragRafRef.current === null) {
          windowDragRafRef.current = requestAnimationFrame(() => {
            windowDragRafRef.current = null;
            if (pendingWindowRef.current) {
              onWindowChange(pendingWindowRef.current.wc, pendingWindowRef.current.ww);
            }
          });
        }
      } else {
        // Pan
        setPan({
          x: dragStartRef.current.startPanX + dx,
          y: dragStartRef.current.startPanY + dy
        });
      }
      return;
    }

    // 2. Ruler update
    if (activeTool === 'ruler' && rulerStart) {
      if (coords) {
        setRulerEnd([coords.x, coords.y]);
      }
      return;
    }

    // 3. Polygon rubberband preview
    if (activeTool === 'polygon' && polygonPoints.length > 0) {
      if (coords) {
        polygonRubberBandRef.current = [coords.x, coords.y];
        if (renderRafRef.current === null) {
          renderRafRef.current = requestAnimationFrame(() => {
            renderRafRef.current = null;
            renderCanvas();
          });
        }
      }
    }

    // 4. Brush / Eraser continuous stroke
    if (isDrawingRef.current && (activeTool === 'brush' || activeTool === 'eraser') && currentDraftMaskRef.current) {
      if (!coords || !lastDrawCoordRef.current) return;

      const rows = currentSlice.rows;
      const cols = currentSlice.cols;
      const radiusPx = Math.max(0.5, brushRadiusMm / (currentSlice.pixelSpacing[1] || 1.0));
      const drawValue: 0 | 1 = activeTool === 'brush' ? 1 : 0;
      const huThreshold = huConstraintEnabled ? { min: huConstraintMin, max: huConstraintMax } : undefined;

      const dist = Math.hypot(coords.x - lastDrawCoordRef.current.x, coords.y - lastDrawCoordRef.current.y);
      if (dist >= 0.2) {
        strokeBrushLine(
          currentDraftMaskRef.current,
          rows,
          cols,
          lastDrawCoordRef.current.x,
          lastDrawCoordRef.current.y,
          coords.x,
          coords.y,
          radiusPx,
          drawValue,
          currentSlice.huData,
          huThreshold, currentSlice.pixelSpacing[1] / currentSlice.pixelSpacing[0]
        );
        lastDrawCoordRef.current = { x: coords.x, y: coords.y };
      }
      
      // Throttle canvas stroke repainting to RAF for stutter-free brush response
      if (renderRafRef.current === null) {
        renderRafRef.current = requestAnimationFrame(() => {
          renderRafRef.current = null;
          renderCanvas();
        });
      }
    }

    // 5. Freehand Pencil points collection
    else if (isDrawingRef.current && activeTool === 'pencil') {
      if (coords) {
        const pts = pencilPointsRef.current;
        const last = pts[pts.length - 1];
        if (!last || last[0] !== coords.x || last[1] !== coords.y) {
          pts.push([coords.x, coords.y]);
        }
        if (renderRafRef.current === null) {
          renderRafRef.current = requestAnimationFrame(() => {
            renderRafRef.current = null;
            renderCanvas();
          });
        }
      }
    }
  };

  // Mouse Up Event Handler
  const handleMouseUp = () => {
    zoomDragRef.current = null;
    setIsDragging(false);

    if (renderRafRef.current !== null) {
      cancelAnimationFrame(renderRafRef.current);
      renderRafRef.current = null;
    }

    // Commit Brush / Eraser stroke
    if (isDrawingRef.current && (activeTool === 'brush' || activeTool === 'eraser')) {
      isDrawingRef.current = false;
      const startCoord = firstDrawCoordRef.current;
      const endCoord = lastDrawCoordRef.current;
      lastDrawCoordRef.current = null;
      firstDrawCoordRef.current = null;
      originalStrokeMaskRef.current = null;

      if (activeRoi && currentDraftMaskRef.current && currentSlice) {
        let finalMask = currentDraftMaskRef.current;
        const rows = currentSlice.rows;
        const cols = currentSlice.cols;
        const radiusPx = Math.max(0.5, brushRadiusMm / (currentSlice.pixelSpacing[1] || 1.0));

        if (activeTool === 'brush' && contourDrawMode === 'closed') {
          // If closed mode: if user drew an enclosed loop, seal the endpoint to startpoint and flood-fill interior
          if (startCoord && endCoord) {
            const distToStart = Math.hypot(endCoord.x - startCoord.x, endCoord.y - startCoord.y);
            if (distToStart > 0 && distToStart <= Math.max(35, radiusPx * 2.5)) {
              strokeBrushLine(
                finalMask,
                rows,
                cols,
                endCoord.x,
                endCoord.y,
                startCoord.x,
                startCoord.y,
                radiusPx,
                1, undefined, undefined, currentSlice.pixelSpacing[1] / currentSlice.pixelSpacing[0]
              );
            }
          }
          finalMask = fillEnclosedHolesOnMask(finalMask, rows, cols);
        }

        onUpdateRoiMask(
          activeRoi.id,
          currentSliceIndex,
          finalMask,
          activeTool === 'brush' 
            ? (contourDrawMode === 'closed' ? `Pincel Cerrada ${brushRadiusMm}mm` : `Pincel Abierta ${brushRadiusMm}mm`)
            : `Borrador ${brushRadiusMm}mm`
        );
        currentDraftMaskRef.current = null;
        renderCanvas();
      }
    }

    // Commit Freehand Pencil stroke
    if (isDrawingRef.current && activeTool === 'pencil') {
      isDrawingRef.current = false;
      const pts = pencilPointsRef.current;
      if (activeRoi && currentSlice && pts.length > 0) {
        const currentMask = (activeRoi.sliceMasks[currentSliceIndex] || createEmptyMask(currentSlice.rows, currentSlice.cols));
        let newMask = cloneMask(currentMask);
        const radiusPx = Math.max(1, Math.round(brushRadiusMm / currentSlice.pixelSpacing[1]));

        if (contourDrawMode === 'closed' && pts.length >= 3) {
          fillPolygonOnMask(newMask, currentSlice.rows, currentSlice.cols, pts, 1);
          newMask = fillEnclosedHolesOnMask(newMask, currentSlice.rows, currentSlice.cols);
          onUpdateRoiMask(activeRoi.id, currentSliceIndex, newMask, 'Lápiz Cerrado (Relleno)');
        } else {
          const huThreshold = huConstraintEnabled ? { min: huConstraintMin, max: huConstraintMax } : undefined;
          strokePathOnMask(newMask, currentSlice.rows, currentSlice.cols, pts, radiusPx, 1, currentSlice.huData, huThreshold, currentSlice.pixelSpacing[1] / currentSlice.pixelSpacing[0]);
          onUpdateRoiMask(activeRoi.id, currentSliceIndex, newMask, 'Lápiz Abierto (Mano Alzada)');
        }
      }
      pencilPointsRef.current = [];
      renderCanvas();
    }

    // Reset Ruler on release
    if (activeTool === 'ruler') {
      // Keep ruler visible until next click or clear
    }
  };

  // Complete and rasterize polygon onto active structure
  const finishPolygon = useCallback(() => {
    if (!activeRoi || !currentSlice || polygonPoints.length < 3) {
      setPolygonPoints([]);
      polygonRubberBandRef.current = null;
      renderCanvas();
      return;
    }

    const currentMask = (activeRoi.sliceMasks[currentSliceIndex] || createEmptyMask(currentSlice.rows, currentSlice.cols));
    let newMask = cloneMask(currentMask);
    const radiusPx = Math.max(1, Math.round(brushRadiusMm / currentSlice.pixelSpacing[1]));

    if (contourDrawMode === 'closed') {
      fillPolygonOnMask(newMask, currentSlice.rows, currentSlice.cols, polygonPoints, 1);
      newMask = fillEnclosedHolesOnMask(newMask, currentSlice.rows, currentSlice.cols);
      onUpdateRoiMask(activeRoi.id, currentSliceIndex, newMask, `Polígono Cerrado (${polygonPoints.length} vértices)`);
    } else {
      const closedPoints = [...polygonPoints, polygonPoints[0]];
      strokePathOnMask(newMask, currentSlice.rows, currentSlice.cols, closedPoints, radiusPx, 1, undefined, undefined, currentSlice.pixelSpacing[1] / currentSlice.pixelSpacing[0]);
      onUpdateRoiMask(activeRoi.id, currentSliceIndex, newMask, `Polígono Abierto (${polygonPoints.length} vértices)`);
    }

    setPolygonPoints([]);
    polygonRubberBandRef.current = null;
    renderCanvas();
  }, [activeRoi, currentSlice, polygonPoints, currentSliceIndex, onUpdateRoiMask, contourDrawMode, brushRadiusMm, renderCanvas]);

  // Cancel polygon
  const cancelPolygon = useCallback(() => {
    setPolygonPoints([]);
    polygonRubberBandRef.current = null;
    renderCanvas();
  }, [renderCanvas]);

  // Double click finishes polygon immediately
  const handleDoubleClick = () => {
    if (activeTool === 'polygon' && polygonPoints.length >= 3) {
      finishPolygon();
    }else if(['pan','zoom','window','ruler'].includes(activeTool)){setMprViewMode(mprViewMode==='triplanar'?'axial':'triplanar');}
  };

  // Mouse Wheel: Scroll slices, Zoom (with Ctrl/Alt), or Brush Diameter (with Shift)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!series || series.slices.length === 0 || isDrawingRef.current) return;

    // 0. Shift + Mouse Wheel: Ergonomic Brush & Eraser Diameter Adjustment
    if (e.shiftKey) {
      // Step size: 0.5mm for fine tuning; 1.0mm if spinning wheel fast
      const step = e.deltaY < 0 ? 0.5 : -0.5;
      const acceleratedStep = Math.abs(e.deltaY) > 50 ? (e.deltaY < 0 ? 1.0 : -1.0) : step;
      const newRadius = Math.max(0.5, Math.min(50, Math.round((brushRadiusMm + acceleratedStep) * 10) / 10));

      if (newRadius !== brushRadiusMm && onBrushRadiusChange) {
        onBrushRadiusChange(newRadius);
      }

      setBrushHudInfo({
        radiusMm: newRadius,
        diameterMm: Math.round(newRadius * 2 * 10) / 10,
        visible: true
      });
      if (brushHudTimeoutRef.current) {
        clearTimeout(brushHudTimeoutRef.current);
      }
      brushHudTimeoutRef.current = setTimeout(() => {
        setBrushHudInfo(prev => ({ ...prev, visible: false }));
      }, 1400);

      updateCursorOverlay(e.clientX, e.clientY, newRadius);
      return;
    }

    if (e.ctrlKey || e.altKey || activeTool === 'zoom') {
      // Zoom with wheel
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom(prev => Math.max(0.2, Math.min(prev * zoomFactor, 6.0)));
      return;
    }

    // Normalize delta across browsers and input modes:
    // deltaMode 0 = PIXEL (Chrome/Safari default, macOS trackpad)
    // deltaMode 1 = LINE (Firefox default, Windows standard line scroll: 1 notch = 1..3 lines)
    // deltaMode 2 = PAGE
    let delta = e.deltaY;
    if (e.deltaMode === 1) {
      // Scale line deltas to pixel equivalent (40px per line) to immediately trigger discrete notch detection
      delta *= 40;
    } else if (e.deltaMode === 2) {
      delta *= 400;
    }

    // Precise 1-to-1 slice navigation (strictly 1 slice per wheel notch / click)
    let step = 0;
    if (Math.abs(delta) >= 35) {
      // Discrete mouse wheel notch: advance exactly 1 slice per notch for true 1:1 tactile navigation
      step = delta > 0 ? 1 : -1;
      wheelAccumulatorRef.current = 0;
    } else {
      // Continuous trackpad: responsive accumulation with low-latency threshold (16px instead of stiff 30px)
      wheelAccumulatorRef.current += delta;
      const TRACKPAD_THRESHOLD = 16;
      if (Math.abs(wheelAccumulatorRef.current) >= TRACKPAD_THRESHOLD) {
        step = wheelAccumulatorRef.current > 0 ? 1 : -1;
        wheelAccumulatorRef.current = 0;
      }
    }

    if (step !== 0) {
      const nextIndex = Math.max(
        0, 
        Math.min(series.slices.length - 1, pendingSliceIndexRef.current + step)
      );

      if (nextIndex !== pendingSliceIndexRef.current) {
        pendingSliceIndexRef.current = nextIndex;
        onSliceChange(nextIndex);
      }
    }

    if (activeTool === 'brush' || activeTool === 'eraser') {
      updateCursorOverlay(e.clientX, e.clientY);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || keyboardDisabled || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      if (e.key === 'Escape') {
        cancelPolygon();
        setRulerStart(null);
        setRulerEnd(null);
      } else if (e.key === 'Enter' && activeTool === 'polygon' && polygonPoints.length >= 3) {
        finishPolygon();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        if (series && currentSliceIndex > 0) onSliceChange(currentSliceIndex - 1);
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        if (series && currentSliceIndex < series.slices.length - 1) onSliceChange(currentSliceIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardDisabled, cancelPolygon, finishPolygon, activeTool, onActiveToolChange, polygonPoints.length, series, currentSliceIndex, onSliceChange]);

  // Context Menu prevent default on canvas
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Descriptive HU classification
  const getHuDescription = (hu: number | null): string => {
    if (hu === null) return '';
    if (hu <= -900) return 'Aire';
    if (hu <= -300) return 'Pulmón';
    if (hu <= -30) return 'Grasa';
    if (hu <= 20) return 'Agua / Líquido';
    if (hu <= 100) return 'Tejido Blando / Músculo';
    if (hu <= 300) return 'Hueso Trabecular';
    return 'Hueso Cortical';
  };

  const mprControls=<MprControlPanel series={series} coordinates={mprCoords} onNavigateCoordinates={handleNavigateCoordinates} activeRoi={activeRoiRef.current} showCrosshairs={showCrosshairs} onToggleCrosshairs={()=>setShowCrosshairs(v=>!v)} onSelectViewMode={setMprViewMode} windowCenter={windowCenter} windowWidth={windowWidth}/>;
  const axialPanel=(
<div onPointerEnter={()=>setDetailPlane('axial')} className="relative w-full h-full min-h-0 flex-1 flex flex-col bg-black overflow-hidden border border-[#1C1C1E]">
            {/* Top Badge for Triplanar mode */}
            {(multi || mprViewMode === 'axial') && (
              <div className="h-8 px-2 flex items-center justify-between shrink-0 bg-zinc-950">
                <div className="flex items-center gap-2 pointer-events-auto bg-[#111112]/90 border border-[#262626] px-2.5 py-1 rounded backdrop-blur-xs shadow-md text-xs">
                  <span onDoubleClick={()=>setMprViewMode(multi?'axial':'triplanar')} className="font-bold text-sky-400">{" "}{tr("Plano Axial (XY)")}{" "}</span>
                  <span className="text-[#777]">•</span>
                  <span className="text-[#AAA] font-mono text-[11px]">{" "}{tr("Z:")}{" "}{currentSliceIndex + 1}/{series?.slices.length || 0}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                <button type="button" onClick={handleResetView} title={tr('Restablecer zoom axial')} aria-label={tr('Restablecer zoom axial')}
                  className="pointer-events-auto p-1 rounded bg-[#111112]/90 border border-[#262626] text-[#777] hover:text-[#D1D1D1] transition cursor-pointer shadow-md">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setMprViewMode(multi?'axial':'triplanar')}
                  className="pointer-events-auto p-1 rounded bg-[#111112]/90 border border-[#262626] text-[#777] hover:text-[#D1D1D1] transition cursor-pointer shadow-md"
                  title={tr("Maximizar Plano Axial")}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                </div>
              </div>
            )}

            {/* Anatomical Orientation Markers (A/P/R/L) */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 text-xs font-bold text-sky-400/80 font-mono pointer-events-none drop-shadow z-5">{"A"}</div>
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 text-xs font-bold text-sky-400/80 font-mono pointer-events-none drop-shadow z-5">{"P"}</div>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-sky-400/80 font-mono pointer-events-none drop-shadow z-5">{"R"}</div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-sky-400/80 font-mono pointer-events-none drop-shadow z-5">{"L"}</div>

            {/* Canvas Viewport */}
            <canvas
              ref={canvasRef}
              data-testid="axial-canvas" data-slice-index={currentSliceIndex} data-zoom={zoom} data-pan-x={pan.x} data-pan-y={pan.y}
        onPointerDown={(e) => {
          if (!e.isPrimary) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // fallback
          }
          handleMouseDown(e);
        }}
        onPointerMove={handleMouseMove}
        onPointerUp={(e) => {
          if (isDrawingRef.current) handleMouseMove(e);
          try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            // fallback
          }
          handleMouseUp();
        }}
        onPointerCancel={(e) => {
          try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            // fallback
          }
          handleMouseUp();
        }}
        onLostPointerCapture={() => {
          if (isDrawingRef.current || zoomDragRef.current) handleMouseUp();
        }}
        onPointerLeave={() => {
          if (cursorSvgRef.current) cursorSvgRef.current.style.display = 'none';
          lastPointerPosRef.current = null;
          if (probeHudRef.current) {
            probeHudRef.current.innerHTML = `<div class="text-[#777]"></div>`;
          }
        }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        className={`w-full h-0 min-h-0 flex-1 bg-black touch-none ${
          activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' :
          activeTool === 'window' ? 'cursor-ew-resize' :
          activeTool === 'zoom' ? 'cursor-ns-resize' :
          activeTool === 'brush' || activeTool === 'eraser' ? 'cursor-none' :
          activeTool === 'polygon' || activeTool === 'pencil' ? 'cursor-crosshair' :
          activeTool === 'ruler' ? 'cursor-crosshair' : 'cursor-default'
        }`}
      />

      {/* Real-time Dynamic Brush / Eraser Thickness Cursor Following Pointer */}
      <svg
        ref={cursorSvgRef}
        className="absolute inset-0 pointer-events-none w-full h-full z-15 overflow-visible"
        style={{ display: 'none' }}
      >
        {/* Contrast halo / drop-shadow behind circle so it remains crisp over white bone & dark air */}
        <circle
          ref={cursorGlowRef}
          cx={0}
          cy={0}
          r={10}
          fill="none"
          stroke="rgba(0, 0, 0, 0.75)"
          strokeWidth={3}
        />
        {/* Main anatomical brush thickness circle */}
        <circle
          ref={cursorCircleRef}
          cx={0}
          cy={0}
          r={10}
          fill="rgba(59, 130, 246, 0.18)"
          stroke="#3B82F6"
          strokeWidth={1.5}
        />
        {/* Precise center crosshair dot */}
        <circle
          ref={cursorCenterRef}
          cx={0}
          cy={0}
          r={1.5}
          fill="#FFFFFF"
          stroke="rgba(0, 0, 0, 0.9)"
          strokeWidth={0.5}
        />
      </svg>

    </div>
  );
  return (
    <div 
      ref={containerRef} 
      className="relative flex-1 bg-black overflow-hidden flex flex-col select-none border-r border-[#262626]"
    >
      {/* 1. MPR Multiplanar Navigation Top Bar */}
      <div className="h-10 bg-[#111112] border-b border-[#262626] px-3 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[#888] hidden sm:inline">{" "}{tr("Plano:")}{" "}</span>

          <div className="flex items-center bg-[#18181A] p-0.5 rounded border border-[#262626]">
            <button
              id="mpr-tab-axial"
              onClick={() => setMprViewMode('axial')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
                mprViewMode === 'axial'
                  ? 'bg-sky-950/80 text-sky-300 border border-sky-500/50 shadow-xs'
                  : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#222]'
              }`}
              title={tr("Corte Transversal / Axial (XY)")}
            >
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>{" "}{tr("Axial")}{" "}</span>
            </button>

            <button
              id="mpr-tab-coronal"
              onClick={() => setMprViewMode('coronal')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
                mprViewMode === 'coronal'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 shadow-xs'
                  : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#222]'
              }`}
              title={tr("Corte Frontal / Coronal (XZ)")}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{" "}{tr("Coronal")}{" "}</span>
            </button>

            <button
              id="mpr-tab-sagittal"
              onClick={() => setMprViewMode('sagittal')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
                mprViewMode === 'sagittal'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500/50 shadow-xs'
                  : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#222]'
              }`}
              title={tr("Corte Lateral / Sagital (YZ)")}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>{" "}{tr("Sagital")}{" "}</span>
            </button>

            <button
              id="mpr-tab-triplanar"
              onClick={() => setMprViewMode('triplanar')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
                mprViewMode === 'triplanar'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#222]'
              }`}
              title={tr("Vista Ortogonal Triplanar Simultánea (Axial, Coronal y Sagital 2x2)")}
            >
              <Grid2X2 className="w-3.5 h-3.5" />
              <span>{" "}{tr("Triplanar 2×2")}{" "}</span>
            </button><button id="mpr-tab-oneplus2" className={`px-3 py-1 text-xs rounded ${mprViewMode==='oneplus2'?'bg-blue-900 text-cyan-300':'text-zinc-400'}`} onClick={()=>setMprViewMode('oneplus2')}>{tr('Vista 1+2')}</button>
          </div>
        </div>

        {/* Right Action: Smooth Contours, Crosshairs Toggle & Coordinates Indicator */}
        <div className="flex items-center gap-2">
          {/* Smooth Contour Anti-aliasing Toggle */}
          <button
            id="btn-toggle-smooth-contours"
            onClick={() => setSmoothContourRendering(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer border ${
              smoothContourRendering
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                : 'bg-[#18181A] border-[#333] text-[#777] hover:text-[#E2E2E2]'
            }`}
            title={tr("Renderizado con Suavizado de Bordes: Aspecto suave y continuo con anti-aliasing sub-píxel en pantalla sin afectar la precisión matemática de la máscara de vóxeles (Click para alternar)")}
          >
            <span className={`w-2 h-2 rounded-full ${smoothContourRendering ? 'bg-emerald-400 ' : 'bg-[#555]'}`} />
            <span className="hidden sm:inline">{smoothContourRendering ? tr("Bordes Suaves") : tr("Píxel 1:1")}</span>
          </button>

          <button
            id="btn-toggle-crosshairs"
            onClick={() => setShowCrosshairs(!showCrosshairs)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer border ${
              showCrosshairs
                ? 'bg-blue-950/70 border-blue-500/50 text-blue-300'
                : 'bg-[#18181A] border-[#333] text-[#777] hover:text-[#E2E2E2]'
            }`}
            title={tr("Activar/Desactivar líneas guía de corte cruzadas 3D")}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{" "}{tr("Guías 3D")}{" "}</span>
          </button>

          <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-[#888] bg-[#141415] px-2.5 py-1 rounded border border-[#222]">
            <span className="text-sky-400">{" "}{tr("Z:")}{" "}{currentSliceIndex + 1}</span>
            <span className="text-[#444]">|</span>
            <span className="text-emerald-400">{" "}{tr("Y:")}{" "}{mprCoords.y + 1}</span>
            <span className="text-[#444]">|</span>
            <span className="text-amber-400">{" "}{tr("X:")}{" "}{mprCoords.x + 1}</span>
          </div>
        </div>
      </div>

      <div id="context-toolbar" className="flex flex-wrap items-center gap-3 px-3 py-1.5 border-b border-zinc-800 bg-zinc-950 text-xs shrink-0">
        <span className="flex items-center gap-2 min-w-0"><i className="w-2 h-2 rounded-full" style={{background:activeRoi?.color || '#888'}}/><strong className="max-w-32 truncate">{activeRoi?.name || tr("Sin ROI activa")}</strong></span>
        {activeTool === 'zoom' && <span className="text-zinc-400">{tr('Arrastre hacia arriba para acercar y hacia abajo para alejar. También puede usar la rueda.')}</span>}
        <span>{({brush:tr("Pincel"),eraser:tr("Borrador"),pencil:tr("Lápiz"),polygon:tr("Polígono"),threshold:tr("Umbral conectado"),pan:tr("Desplazar"),zoom:tr("Zoom"),window:tr("Ventana"),ruler:tr("Regla")})[activeTool]}</span>
        {["brush","eraser","pencil"].includes(activeTool) && <label className={brushHudInfo.visible?'text-sky-300':'text-zinc-300'} title={tr("Radio físico del pincel. Mayús + rueda para ajustar.")}>{" "}{tr("Radio")}{" "}<input aria-label={tr("Radio del pincel")} type="number" min="0.5" max="50" step="0.5" className="w-16 bg-zinc-800 rounded px-1" value={brushRadiusMm} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v) && v>=.5 && v<=50)onBrushRadiusChange?.(v);}}/>{" "}{tr("mm")}{" "}</label>}
        {["brush","pencil","polygon"].includes(activeTool) && <select aria-label={tr("Modo de contorno")} className="bg-zinc-800 rounded p-1" value={contourDrawMode} onChange={e=>onContourDrawModeChange?.(e.target.value as ContourDrawMode)}><option value="closed">{" "}{tr("Cerrado")}{" "}</option><option value="open">{" "}{tr("Abierto")}{" "}</option></select>}
        <div className="flex items-center gap-2 ml-auto"><span title={tr("Ancho y centro de ventana")}>{" "}{tr("W")}{" "}{windowWidth}{" "}{tr("· L")}{" "}{windowCenter}</span><span className="text-zinc-400">{tr("Axial")}</span><button title={tr("Alejar")} onClick={()=>setZoom(v=>Math.max(.1,v/1.25))}>−</button><span>{zoom.toFixed(1)}{" "}{tr("×")}{" "}</span><button title={tr("Acercar")} onClick={()=>setZoom(v=>Math.min(6,v*1.25))}>+</button><button onClick={handleResetView}>{" "}{tr("Ajustar")}{" "}</button></div>
        {registrationState?.active && <div className="flex items-center gap-2"><button onClick={onOpenRegistrationModal}>{" "}{tr("Fusión ·")}{" "}{series?.modality} + {studies.find(s=>s.id===registrationState.secondaryStudyId)?.modality}</button><input aria-label={tr("Opacidad de fusión")} type="range" min="0" max="1" step=".05" className="w-20" value={registrationState.fusionOpacity} onChange={e=>onFusionOpacityChange?.(Number(e.target.value))}/></div>}
      </div>
      {/* Polygon in-progress Action Bar */}
      {activeTool === 'polygon' && polygonPoints.length > 0 && (
        <div className="relative bg-[#111112]/95 border border-[#333] rounded px-4 py-1.5 flex items-center gap-3 text-xs text-[#D1D1D1] shrink-0">
          <span className="font-mono text-xs text-blue-400">{" "}{tr("POLÍGONO (")}{" "}{contourDrawMode === 'closed' ? tr("Cerrado / Relleno") : tr("Abierto / Trazo")}): {polygonPoints.length}{" "}{tr("vértices")}{" "}</span>
          <button
            id="btn-finish-polygon"
            onClick={finishPolygon}
            disabled={polygonPoints.length < 3}
            className="flex items-center gap-1 px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-[#1A1A1B] disabled:text-[#777] text-white font-medium transition cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{" "}{tr("Finalizar (Enter)")}{" "}</span>
          </button>
          <button
            id="btn-cancel-polygon"
            onClick={cancelPolygon}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1A1A1B] hover:bg-[#262626] border border-[#333] text-[#888] hover:text-white transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>{" "}{tr("Cancelar (Esc)")}{" "}</span>
          </button>
        </div>
      )}


      {/* Mount only visible panels: inactive 3D renderers and workers are disposed. */}
      <div className="flex-1 min-h-0 relative w-full overflow-hidden flex">
        {mprViewMode==='coronal' || mprViewMode==='sagittal'?<MprOrthogonalView onActivate={setDetailPlane} plane={mprViewMode} series={series} coordinates={mprCoords} onNavigateCoordinates={handleNavigateCoordinates} windowCenter={windowCenter} windowWidth={windowWidth} rois={rois} showRois activeRoiId={activeRoi?.id} showCrosshairs={showCrosshairs} onToggleCrosshairs={()=>setShowCrosshairs(v=>!v)} isMaximized onMaximize={()=>setMprViewMode('triplanar')}/>:mprViewMode==='axial'?axialPanel:
        <div ref={workspaceRef} data-testid="multi-layout" className="relative grid flex-1 min-w-0 min-h-0 gap-1 p-1 bg-zinc-950" style={{gridTemplateColumns:mprViewMode==='oneplus2'?`minmax(0,${split}fr) 6px minmax(0,${100-split}fr)`:'repeat(2,minmax(0,1fr))',gridTemplateRows:'repeat(2,minmax(0,1fr))'}}>
          {paneConfigs.slice(0,mprViewMode==='oneplus2'?3:4).map((config,index)=><div key={index} className="flex flex-col min-w-0 min-h-0" style={mprViewMode==='oneplus2'?index===0?{gridColumn:1,gridRow:'1 / 3'}:{gridColumn:3,gridRow:index}:undefined}>
            <ConfigurablePane index={index} config={config} onChange={value=>setPaneConfigs(p=>p.map((c,i)=>i===index?value:c))} series={series} studies={studies} coordinates={mprCoords} onNavigate={handleNavigateCoordinates} rois={rois} activeRoiId={activeRoi?.id} registration={registrationState} windowCenter={windowCenter} windowWidth={windowWidth} showCrosshairs={showCrosshairs} onToggleCrosshairs={()=>setShowCrosshairs(v=>!v)} detailPlane={detailPlane} onActivate={setDetailPlane} controls={mprControls} editor={index===editorIndex?axialPanel:undefined}/>
          </div>)}
          {mprViewMode==='oneplus2' && <div role="separator" aria-label={tr('Distribución de paneles')} aria-orientation="vertical" aria-valuenow={Math.round(split)} aria-valuemin={25} aria-valuemax={80} tabIndex={0} className="bg-zinc-700 hover:bg-blue-500 cursor-col-resize touch-none rounded" style={{gridColumn:2,gridRow:'1 / 3'}} onDoubleClick={()=>setSplit(65)} onKeyDown={e=>{if(e.key==='ArrowLeft' || e.key==='ArrowRight'){e.preventDefault();setSplit(v=>Math.max(25,Math.min(80,v+(e.key==='ArrowLeft'?-2:2))));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){const r=workspaceRef.current!.getBoundingClientRect();setSplit(Math.max(25,Math.min(80,100*(e.clientX-r.left)/r.width)));}}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}/>}
        </div>}
      </div>

{/* Bottom Slice Navigation Slider Bar matching Sophisticated Dark */}
{series && series.slices.length > 0 && (
        <div className="h-11 bg-[#111112] border-t border-[#262626] px-5 flex items-center justify-between gap-4 text-xs text-[#D1D1D1] z-10">
          {/* Slice controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSliceChange(Math.max(0, currentSliceIndex - 1))}
              disabled={currentSliceIndex === 0}
              className="p-1 rounded hover:bg-[#1A1A1B] disabled:opacity-30 disabled:cursor-not-allowed text-[#888] hover:text-[#E2E2E2] transition cursor-pointer"
              title={tr("Corte Anterior (Flecha Arriba)")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-1.5 rounded transition cursor-pointer ${
                isPlaying ? 'bg-blue-600 text-white' : 'hover:bg-[#1A1A1B] text-[#888] hover:text-[#E2E2E2]'
              }`}
              title={isPlaying ? tr("Pausar Cine") : tr("Reproducir Cine (Loop de cortes)")}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => onSliceChange(Math.min(series.slices.length - 1, currentSliceIndex + 1))}
              disabled={currentSliceIndex === series.slices.length - 1}
              className="p-1 rounded hover:bg-[#1A1A1B] disabled:opacity-30 disabled:cursor-not-allowed text-[#888] hover:text-[#E2E2E2] transition cursor-pointer"
              title={tr("Corte Siguiente (Flecha Abajo)")}
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="font-mono text-xs text-blue-400 font-medium ml-2">{" "}{tr("Corte")}{" "}<input aria-label={tr("Ir al corte axial")} type="number" className="w-16 bg-zinc-800 rounded px-1" min="1" max={series.slices.length} value={currentSliceIndex+1} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n) && n>=1 && n<=series.slices.length)onSliceChange(n-1);}}/> / {series.slices.length}
            </span>
          </div>

          {/* Slider */}
          <div className="flex-1 max-w-xl mx-4 flex items-center gap-3">
            <span className="text-[11px] font-mono text-[#888]">1</span>
            <input
              type="range"
              min="0"
              max={series.slices.length - 1}
              value={currentSliceIndex}
              onChange={(e) => onSliceChange(parseInt(e.target.value))}
              className="w-full h-1 bg-[#262626] rounded appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-[11px] font-mono text-[#888]">{series.slices.length}</span>
          </div>

          <span ref={probeHudRef} className="text-xs text-zinc-400 min-w-0 truncate"/>
          <button className="text-xs" onClick={()=>setMprViewMode(mprViewMode==='triplanar'?'axial':'triplanar')}>{mprViewMode==='triplanar'?tr("Ampliar axial"):tr("Vista 2×2")}</button>
        </div>
      )}
    </div>
  );
};

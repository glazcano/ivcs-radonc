import {tr} from '../i18n';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Maximize2, 
  RotateCcw, 
  Crosshair, 
  ChevronLeft, 
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  DicomSeries, 
  StructureRoi, 
  MprCoordinates, 
  MprPlane 
} from '../types';
import { 
  getVolumeGeometry, 
  renderCoronalSliceToCanvas, 
  renderSagittalSliceToCanvas, 
  sampleVoxelHu,
  vToZIndex,
  zToVIndex,
  voxelToPatientCoordinates
} from '../utils/mprEngine';

const viewPositions=new WeakMap<DicomSeries,Record<string,{zoom:number;pan:{x:number;y:number}}>>();
interface MprOrthogonalViewProps {
  onActivate?:(plane:'coronal'|'sagittal')=>void;
  plane: 'coronal' | 'sagittal';
  series: DicomSeries | null;
  coordinates: MprCoordinates;
  onNavigateCoordinates: (newCoords: Partial<MprCoordinates>) => void;
  windowCenter: number;
  windowWidth: number;
  rois?: StructureRoi[];
  showRois?: boolean;
  activeRoiId?: string | null;
  showCrosshairs?: boolean;
  onToggleCrosshairs?: () => void;
  onMaximize?: () => void;
  isMaximized?: boolean;
}

export const MprOrthogonalView: React.FC<MprOrthogonalViewProps> = ({
  plane, onActivate,
  series,
  coordinates,
  onNavigateCoordinates,
  windowCenter,
  windowWidth,
  rois = [],
  showRois = true,
  activeRoiId = null,
  showCrosshairs = true,
  onToggleCrosshairs,
  onMaximize,
  isMaximized = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport transforms (Zoom & Pan)
  const [zoom, setZoom] = useState<number>(()=>series?viewPositions.get(series)?.[plane]?.zoom || 1:1);
  const [pan, setPan] = useState<{ x: number; y: number }>(()=>series?viewPositions.get(series)?.[plane]?.pan || {x:0,y:0}:{x:0,y:0});
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [interactionMode, setInteractionMode] = useState<'crosshair' | 'pan'>('crosshair');

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startPanX: number;
    startPanY: number;
  }>({ clientX: 0, clientY: 0, startPanX: 0, startPanY: 0 });

  useEffect(()=>{if(series)viewPositions.set(series,{...viewPositions.get(series),[plane]:{zoom,pan}});},[series,plane,zoom,pan]);
  // Probe HU state
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    z: number;
    hu: number | null;
  } | null>(null);

  // Dimensions
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 400, height: 400 });

  // Geometry
  const geo = getVolumeGeometry(series);
  const { cols, rows, numSlices, isZAscending, pixelSpacingX, pixelSpacingY, sliceSpacingZ } = geo;

  // Track container resize
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      if (w > 0 && h > 0) {
        setDimensions({ width: w, height: h });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Offscreen slice cache (rebuilt when slice coordinate, windowing or ROIs change)
  const offscreenSliceRef = useRef<HTMLCanvasElement | null>(null);

  const currentSliceIndex = plane === 'coronal' ? coordinates.y : coordinates.x;
  const maxSliceIndex = plane === 'coronal' ? rows - 1 : cols - 1;

  useEffect(() => {
    if (!series || !series.slices || series.slices.length === 0) {
      offscreenSliceRef.current = null;
      return;
    }

    if (plane === 'coronal') {
      offscreenSliceRef.current = renderCoronalSliceToCanvas(
        series,
        coordinates.y,
        { windowCenter, windowWidth, rois, showRois, activeRoiId }
      );
    } else {
      offscreenSliceRef.current = renderSagittalSliceToCanvas(
        series,
        coordinates.x,
        { windowCenter, windowWidth, rois, showRois, activeRoiId }
      );
    }

    renderToMainCanvas();
  }, [
    series,
    plane,
    coordinates.y,
    coordinates.x,
    windowCenter,
    windowWidth,
    rois,
    showRois,
    activeRoiId
  ]);

  // Main Render Loop
  const renderToMainCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background to deep PACS black
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    const offscreen = offscreenSliceRef.current;
    if (!offscreen || !series || series.slices.length === 0) {
      ctx.fillStyle = '#444';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos de imagen 3D', width / 2, height / 2);
      return;
    }

    // Determine physical aspect ratio and destination fit
    const imgAspect = plane === 'coronal' ? geo.coronalAspect : geo.sagittalAspect;
    const baseW = plane === 'coronal' ? cols : rows;
    const baseH = numSlices;

    // Calculate fitted dimensions maintaining true millimeter proportions
    const containerAspect = height / (width || 1);
    let fitW: number;
    let fitH: number;

    if (containerAspect > imgAspect) {
      fitW = width * 0.90;
      fitH = fitW * imgAspect;
    } else {
      fitH = height * 0.90;
      fitW = fitH / (imgAspect || 1);
    }

    const scaledW = fitW * zoom;
    const scaledH = fitH * zoom;

    const destX = width / 2 - scaledW / 2 + pan.x;
    const destY = height / 2 - scaledH / 2 + pan.y;

    // Draw resliced image with high quality bilinear interpolation
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, destX, destY, scaledW, scaledH);

    // Subtle container border around image extent
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.strokeRect(destX, destY, scaledW, scaledH);

    // Draw Crosshair Lines
    if (showCrosshairs) {
      ctx.save();
      ctx.lineWidth = 1;

      // Vertical line:
      // In Coronal: shows Sagittal plane (X)
      // In Sagittal: shows Coronal plane (Y)
      const uCoord = plane === 'coronal' ? coordinates.x : coordinates.y;
      const uMax = plane === 'coronal' ? cols : rows;
      const uRatio = Math.max(0, Math.min(1, uCoord / (uMax - 1)));
      const crosshairX = destX + uRatio * scaledW;

      // Color coding:
      // Sagittal line is Orange/Amber (#F59E0B)
      // Coronal line is Green/Lime (#10B981)
      ctx.strokeStyle = plane === 'coronal' ? 'rgba(245, 158, 11, 0.75)' : 'rgba(16, 185, 129, 0.75)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(crosshairX, destY);
      ctx.lineTo(crosshairX, destY + scaledH);
      ctx.stroke();

      // Horizontal line: shows Axial plane (Z)
      const vIndex = zToVIndex(coordinates.z, numSlices, isZAscending);
      const vRatio = Math.max(0, Math.min(1, vIndex / (numSlices - 1)));
      const crosshairY = destY + vRatio * scaledH;

      // Axial line is Sky Blue (#38BDF8)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.beginPath();
      ctx.moveTo(destX, crosshairY);
      ctx.lineTo(destX + scaledW, crosshairY);
      ctx.stroke();

      // Intersection indicator
      ctx.setLineDash([]);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(crosshairX, crosshairY, 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }, [
    series,
    plane,
    coordinates.x,
    coordinates.y,
    coordinates.z,
    zoom,
    pan.x,
    pan.y,
    cols,
    rows,
    numSlices,
    isZAscending,
    geo.coronalAspect,
    geo.sagittalAspect,
    showCrosshairs
  ]);

  // Redraw when dimensions, zoom, pan, or coords change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
    }
    renderToMainCanvas();
  }, [dimensions, renderToMainCanvas]);

  // Convert screen coordinates to volume voxel coordinates
  const screenToVolumeCoords = useCallback((screenX: number, screenY: number): { u: number; v: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const canvasX = (screenX - rect.left) * (canvas.width / rect.width);
    const canvasY = (screenY - rect.top) * (canvas.height / rect.height);

    const imgAspect = plane === 'coronal' ? geo.coronalAspect : geo.sagittalAspect;
    const containerAspect = canvas.height / (canvas.width || 1);
    let fitW: number;
    let fitH: number;

    if (containerAspect > imgAspect) {
      fitW = canvas.width * 0.90;
      fitH = fitW * imgAspect;
    } else {
      fitH = canvas.height * 0.90;
      fitW = fitH / (imgAspect || 1);
    }

    const scaledW = fitW * zoom;
    const scaledH = fitH * zoom;
    const destX = canvas.width / 2 - scaledW / 2 + pan.x;
    const destY = canvas.height / 2 - scaledH / 2 + pan.y;

    const relX = (canvasX - destX) / scaledW;
    const relY = (canvasY - destY) / scaledH;

    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;

    const uMax = plane === 'coronal' ? cols - 1 : rows - 1;
    const vMax = numSlices - 1;

    const u = Math.max(0, Math.min(uMax, Math.round(relX * uMax)));
    const v = Math.max(0, Math.min(vMax, Math.round(relY * vMax)));

    return { u, v };
  }, [plane, geo.coronalAspect, geo.sagittalAspect, zoom, pan.x, pan.y, cols, rows, numSlices]);

  // Pointer interactions for crosshair navigation and panning
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);

    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      // Middle click, right click, or shift+click = PAN
      setInteractionMode('pan');
      setIsInteracting(true);
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y
      };
      return;
    }

    // Left click = Crosshair navigation
    setInteractionMode('crosshair');
    setIsInteracting(true);

    const coords = screenToVolumeCoords(e.clientX, e.clientY);
    if (coords) {
      const zIndex = vToZIndex(coords.v, numSlices, isZAscending);
      if (plane === 'coronal') {
        onNavigateCoordinates({ x: coords.u, z: zIndex });
      } else {
        onNavigateCoordinates({ y: coords.u, z: zIndex });
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 1. If dragging pan
    if (isInteracting && interactionMode === 'pan') {
      const dx = e.clientX - dragStartRef.current.clientX;
      const dy = e.clientY - dragStartRef.current.clientY;
      setPan({
        x: dragStartRef.current.startPanX + dx,
        y: dragStartRef.current.startPanY + dy
      });
      return;
    }

    // 2. If dragging crosshair
    if (isInteracting && interactionMode === 'crosshair') {
      const coords = screenToVolumeCoords(e.clientX, e.clientY);
      if (coords) {
        const zIndex = vToZIndex(coords.v, numSlices, isZAscending);
        if (plane === 'coronal') {
          onNavigateCoordinates({ x: coords.u, z: zIndex });
        } else {
          onNavigateCoordinates({ y: coords.u, z: zIndex });
        }
      }
    }

    // 3. Hover probe HUD
    const coords = screenToVolumeCoords(e.clientX, e.clientY);
    if (coords) {
      const zIndex = vToZIndex(coords.v, numSlices, isZAscending);
      const xIndex = plane === 'coronal' ? coords.u : coordinates.x;
      const yIndex = plane === 'coronal' ? coordinates.y : coords.u;
      const hu = sampleVoxelHu(series, xIndex, yIndex, zIndex);
      setHoverInfo({ x: xIndex, y: yIndex, z: zIndex, hu });
    } else {
      setHoverInfo(null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
        canvasRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      // fallback
    }
    setIsInteracting(false);
  };

  // Mouse wheel: scroll through this plane's slices
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const currentVal = plane === 'coronal' ? coordinates.y : coordinates.x;
    const maxVal = plane === 'coronal' ? rows - 1 : cols - 1;
    const nextVal = Math.max(0, Math.min(maxVal, currentVal + delta));

    if (nextVal !== currentVal) {
      if (plane === 'coronal') {
        onNavigateCoordinates({ y: nextVal });
      } else {
        onNavigateCoordinates({ x: nextVal });
      }
    }
  };

  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Physical coordinates for display
  const physicalCoords = voxelToPatientCoordinates(coordinates, series);

  return (
    <div 
      data-plane={plane} ref={containerRef} onPointerEnter={()=>onActivate?.(plane)}
      className="relative flex-1 bg-black overflow-hidden flex flex-col select-none border border-[#222]"
    >
      {/* Plane toolbar */}
      <div onDoubleClick={e=>{if(!(e.target as HTMLElement).closest('button,input'))onMaximize?.();}} className="h-8 px-2 flex items-center justify-between shrink-0 bg-zinc-950">
        <div className="flex items-center gap-2 pointer-events-auto bg-[#111112]/90 border border-[#262626] px-2.5 py-1 rounded backdrop-blur-xs shadow-md text-xs">
          <span className={`font-bold ${
            plane === 'coronal' ? 'text-emerald-400' : 'text-amber-400'
          }`}>
            {plane === 'coronal' ? tr("Coronal") : tr("Sagital")}
          </span>
          <span className="text-[#777]">•</span>
          <span className="hidden xl:inline text-[#AAA] font-mono text-[11px]">
            {plane === 'coronal' 
              ? tr("Y: {0}/{1} ({2} mm)", [coordinates.y + 1,rows,physicalCoords.yMm])
              : tr("X: {0}/{1} ({2} mm)", [coordinates.x + 1,cols,physicalCoords.xMm])}
          </span>
        </div>

        {/* View Action Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-[#111112]/90 border border-[#262626] px-1.5 py-1 rounded backdrop-blur-xs shadow-md">
          <button title={tr('Alejar')} onClick={()=>setZoom(v=>Math.max(.2,v/1.25))}>−</button><span className="text-xs" data-plane-zoom={plane}>{zoom.toFixed(1)}×</span><button title={tr('Acercar')} onClick={()=>setZoom(v=>Math.min(6,v*1.25))}>+</button>
          {onToggleCrosshairs && (
            <button
              onClick={onToggleCrosshairs}
              className={`p-1 rounded transition cursor-pointer ${
                showCrosshairs ? 'text-blue-400 bg-blue-950/40' : 'text-[#777] hover:text-[#D1D1D1]'
              }`}
              title={showCrosshairs ? tr("Ocultar Guías Crosshair") : tr("Mostrar Guías Crosshair")}
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleResetView}
            className="p-1 rounded text-[#777] hover:text-[#D1D1D1] transition cursor-pointer"
            title={tr("Restablecer Zoom y Posición")}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {onMaximize && (
            <button
              onClick={onMaximize}
              className={`p-1 rounded transition cursor-pointer ${
                isMaximized ? 'text-blue-400 bg-blue-950/40' : 'text-[#777] hover:text-[#D1D1D1]'
              }`}
              title={isMaximized ? tr("Volver a Vista Múltiple") : tr("Maximizar este Plano")}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Anatomical Orientation Markers (S/I/R/L or S/I/A/P) */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 text-xs font-bold text-amber-500/80 font-mono pointer-events-none drop-shadow z-5">{"S"}</div>
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 text-xs font-bold text-amber-500/80 font-mono pointer-events-none drop-shadow z-5">{"I"}</div>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500/80 font-mono pointer-events-none drop-shadow z-5">
        {plane === 'coronal' ? "R" : "A"}
      </div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500/80 font-mono pointer-events-none drop-shadow z-5">
        {plane === 'coronal' ? "L" : "P"}
      </div>

      {/* Canvas Viewport */}
      <canvas
        ref={canvasRef}
        onDoubleClick={onMaximize}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => setHoverInfo(null)}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-0 min-h-0 flex-1 bg-black touch-none cursor-crosshair"
      />

      {/* Plane navigation */}
      <div className="h-10 bg-[#111112]/95 border-t border-[#262626] px-3 flex items-center justify-between gap-3 text-xs text-[#D1D1D1] z-10 shrink-0">
        {/* Slice Navigation Slider */}
        <div className="flex items-center gap-1.5 flex-1 max-w-sm">
          <button
            onClick={() => {
              const currentVal = plane === 'coronal' ? coordinates.y : coordinates.x;
              const nextVal = Math.max(0, currentVal - 1);
              if (plane === 'coronal') onNavigateCoordinates({ y: nextVal });
              else onNavigateCoordinates({ x: nextVal });
            }}
            disabled={currentSliceIndex === 0}
            className="p-1 rounded hover:bg-[#222] disabled:opacity-30 disabled:cursor-not-allowed text-[#888] hover:text-[#E2E2E2] transition cursor-pointer"
            title={tr("Corte Anterior")}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <input aria-label={plane==='coronal'?tr("Ir al corte coronal"):tr("Ir al corte sagital")} type="number" className="w-16 bg-zinc-800 rounded px-1" min="1" max={maxSliceIndex+1} value={currentSliceIndex+1} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n) && n>=1 && n<=maxSliceIndex+1)onNavigateCoordinates(plane==='coronal'?{y:n-1}:{x:n-1});}}/>
          <input
            type="range"
            min="0"
            max={maxSliceIndex}
            value={currentSliceIndex}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (plane === 'coronal') onNavigateCoordinates({ y: val });
              else onNavigateCoordinates({ x: val });
            }}
            className="w-full h-1 bg-[#262626] rounded appearance-none cursor-pointer accent-blue-500"
          />

          <button
            onClick={() => {
              const currentVal = plane === 'coronal' ? coordinates.y : coordinates.x;
              const nextVal = Math.min(maxSliceIndex, currentVal + 1);
              if (plane === 'coronal') onNavigateCoordinates({ y: nextVal });
              else onNavigateCoordinates({ x: nextVal });
            }}
            disabled={currentSliceIndex === maxSliceIndex}
            className="p-1 rounded hover:bg-[#222] disabled:opacity-30 disabled:cursor-not-allowed text-[#888] hover:text-[#E2E2E2] transition cursor-pointer"
            title={tr("Corte Siguiente")}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* HU Probe & Crosshair Info */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-[#888] shrink-0">
          {hoverInfo ? (
            <div className="flex items-center gap-2">
              <span className="text-blue-400 font-semibold">{" "}{tr("HU:")}{" "}{hoverInfo.hu !== null ? hoverInfo.hu : '--'}
              </span>
              <span className="text-[#777]">|</span>
              <span>{" "}{tr("XYZ: [")}{" "}{hoverInfo.x}, {hoverInfo.y}, {hoverInfo.z}]</span>
            </div>
          ) : (
            <div className="text-[#777]">{" "}{tr("Arrastra crosshair • Rueda = corte")}{" "}</div>
          )}
        </div>
      </div>
    </div>
  );
};

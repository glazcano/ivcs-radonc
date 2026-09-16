import {tr} from '../i18n';
import React from 'react';
import {useShortcuts} from '../utils/useShortcuts';
import { 
  Paintbrush, 
  PenTool, 
  Hexagon, 
  Eraser, 
  SunMedium, 
  Move, 
  ZoomIn, 
  Ruler, 
  Undo2, 
  Redo2, 
  Trash2,
  Filter,
  CircleDot,
  PenLine,
  PaintBucket,
  RotateCcw,
  Sliders,
  Sparkles
} from 'lucide-react';
import { StructureRoi, ToolType, WindowPreset, ContourDrawMode } from '../types';
import { WINDOW_PRESETS } from '../utils/presets';

export interface ToolsPanelSectionProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  brushRadiusMm: number;
  onBrushRadiusChange: (radiusMm: number) => void;
  pixelSpacingMm: number;
  activeRoi: StructureRoi | null;
  rois: StructureRoi[];
  onSelectRoi: (roi: StructureRoi) => void;
  currentWindowPreset: string;
  onApplyWindowPreset: (preset: WindowPreset) => void;
  windowCenter: number;
  windowWidth: number;
  onWindowChange?: (wc: number, ww: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearCurrentSliceContour: () => void;
  huConstraintEnabled: boolean;
  onToggleHuConstraint: () => void;
  huConstraintMin: number;
  huConstraintMax: number;
  onChangeHuConstraint: (min: number, max: number) => void;
  contourDrawMode: ContourDrawMode;
  onChangeContourDrawMode: (mode: ContourDrawMode) => void;
  onFillEnclosedHoles?: () => void;
  onResetView?: () => void;
}

export type ToolSubTabType = 'contour' | 'view';

export const ToolsPanelSection: React.FC<ToolsPanelSectionProps> = ({
  activeTool,
  onSelectTool,
  brushRadiusMm,
  onBrushRadiusChange,
  pixelSpacingMm,
  activeRoi,
  rois,
  onSelectRoi,
  currentWindowPreset,
  onApplyWindowPreset,
  windowCenter,
  windowWidth,
  onWindowChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClearCurrentSliceContour,
  huConstraintEnabled,
  onToggleHuConstraint,
  huConstraintMin,
  huConstraintMax,
  onChangeHuConstraint,
  contourDrawMode,
  onChangeContourDrawMode,
  onFillEnclosedHoles,
  onResetView
}) => {
  const shortcuts=useShortcuts();
  // Nested sub-tab: Contorno vs Visor
  const isViewTool = ['window', 'pan', 'zoom', 'ruler'].includes(activeTool);
  const [subTab, setSubTab] = React.useState<ToolSubTabType>(isViewTool ? 'view' : 'contour');

  // If tool changes externally via keyboard shortcuts, reflect appropriate sub-tab
  React.useEffect(() => {
    if (['brush', 'pencil', 'polygon', 'eraser', 'threshold'].includes(activeTool)) {
      setSubTab('contour');
    } else if (['window', 'pan', 'zoom', 'ruler'].includes(activeTool)) {
      setSubTab('view');
    }
  }, [activeTool]);

  const brushRadiusPx = Math.round(brushRadiusMm / (pixelSpacingMm || 1));
  const brushSizesMm = [2, 4, 7, 12, 18, 25];

  const contourTools: Array<{ id: ToolType; label: string; desc: string; icon: React.ReactNode; shortcut: string }> = [
    { id: 'brush', label: tr("Pincel"), desc: tr("Pinta voxel con radio circular en mm"), icon: <Paintbrush className="w-4 h-4" />, shortcut: 'B' },
    { id: 'pencil', label: tr("Lápiz"), desc: tr("Trazo continuo a mano alzada"), icon: <PenTool className="w-4 h-4" />, shortcut: 'P' },
    { id: 'polygon', label: tr("Polígono"), desc: tr("Vértices con clic, Enter para cerrar"), icon: <Hexagon className="w-4 h-4" />, shortcut: 'G' },
    { id: 'eraser', label: tr("Borrador"), desc: tr("Elimina voxels con radio circular"), icon: <Eraser className="w-4 h-4" />, shortcut: 'E' },
    { id: 'threshold', label: tr("Umbral HU"), desc: tr("Segmentación por densidad radiológica"), icon: <Filter className="w-4 h-4" />, shortcut: 'T' },
  ];

  const viewTools: Array<{ id: ToolType; label: string; desc: string; icon: React.ReactNode; shortcut: string }> = [
    { id: 'window', label: tr("Ventana W/L"), desc: tr("Arrastrar para cambiar brillo/contraste"), icon: <SunMedium className="w-4 h-4" />, shortcut: 'W' },
    { id: 'pan', label: tr("Desplazar"), desc: tr("Arrastrar para mover corte anatómico"), icon: <Move className="w-4 h-4" />, shortcut: 'H' },
    { id: 'zoom', label: tr("Zoom"), desc: tr("Arrastrar verticalmente para acercar"), icon: <ZoomIn className="w-4 h-4" />, shortcut: 'Z' },
    { id: 'ruler', label: tr("Regla mm"), desc: tr("Medir distancia calibrada en milímetros"), icon: <Ruler className="w-4 h-4" />, shortcut: 'R' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-3.5 gap-3.5 text-[#D1D1D1]">
      {/* Nested Sub-Menu Header: Contorno vs Visor */}
      <div className="grid grid-cols-2 bg-[#111112] p-1 rounded-lg border border-[#262626]">
        <button
          id="subtab-contour"
          type="button"
          onClick={() => {
            setSubTab('contour');
            if (['window', 'pan', 'zoom', 'ruler'].includes(activeTool)) {
              onSelectTool('brush');
            }
          }}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
            subTab === 'contour'
              ? 'bg-blue-600 text-white shadow-sm font-semibold'
              : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#1A1A1B]'
          }`}
        >
          <Paintbrush className="w-3.5 h-3.5" />
          <span>{" "}{tr("Contorno")}{" "}</span>
        </button>

        <button
          id="subtab-view"
          type="button"
          onClick={() => {
            setSubTab('view');
            if (!['window', 'pan', 'zoom', 'ruler'].includes(activeTool)) {
              onSelectTool('window');
            }
          }}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
            subTab === 'view'
              ? 'bg-blue-600 text-white shadow-sm font-semibold'
              : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#1A1A1B]'
          }`}
        >
          <SunMedium className="w-3.5 h-3.5" />
          <span>{" "}{tr("Visor y Ventana")}{" "}</span>
        </button>
      </div>

      {/* ======================= CONTORNO SUB-TAB ======================= */}
      {subTab === 'contour' && (
        <div className="flex flex-col gap-3.5">
          <p className="text-xs text-zinc-400">{tr('El radio y el modo de contorno están en la barra del visor.')}</p>
          <button id="btn-panel-fill-holes" className="border border-zinc-700 rounded p-2 text-xs" disabled={!activeRoi || activeRoi.locked} onClick={onFillEnclosedHoles}>{tr('Rellenar Huecos Interiores')}</button>
          {/* Radiodensity HU Filter */}
          <div className="bg-[#111112] border border-[#262626] rounded-lg p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={huConstraintEnabled}
                  onChange={onToggleHuConstraint}
                  className="accent-blue-500 rounded cursor-pointer"
                />
                <span className="text-[11px] text-[#AAA]">{" "}{tr("Filtro de Densidad HU")}{" "}</span>
              </label>
              <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded ${
                huConstraintEnabled ? 'bg-blue-950 text-blue-400 border border-blue-800' : 'text-[#777]'
              }`}>
                {huConstraintEnabled ? tr("ACTIVO") : tr("INACTIVO")}
              </span>
            </div>

            {huConstraintEnabled && (
              <div className="flex flex-col gap-2 pt-1 border-t border-[#262626]">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[11px] text-[#888] block mb-0.5">{" "}{tr("Mínimo HU")}{" "}</span>
                    <input
                      type="number"
                      value={huConstraintMin}
                      onChange={e => onChangeHuConstraint(Number(e.target.value), huConstraintMax)}
                      className="w-full bg-[#1A1A1B] text-blue-400 font-mono text-xs px-2 py-1 rounded border border-[#333] focus:border-blue-500 text-center"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#888] block mb-0.5">{" "}{tr("Máximo HU")}{" "}</span>
                    <input
                      type="number"
                      value={huConstraintMax}
                      onChange={e => onChangeHuConstraint(huConstraintMin, Number(e.target.value))}
                      className="w-full bg-[#1A1A1B] text-blue-400 font-mono text-xs px-2 py-1 rounded border border-[#333] focus:border-blue-500 text-center"
                    />
                  </div>
                </div>

                {/* Quick tissue presets */}
                <div className="grid grid-cols-3 gap-1 text-[11px] font-mono">
                  <button
                    type="button"
                    onClick={() => onChangeHuConstraint(150, 3000)}
                    className="p-1 rounded bg-[#1A1A1B] border border-[#333] hover:border-blue-500 text-[#AAA] hover:text-white text-center cursor-pointer"
                    title={tr("Hueso trabecular y cortical (> 150 HU)")}
                  >{" "}{tr("Hueso")}{" "}</button>
                  <button
                    type="button"
                    onClick={() => onChangeHuConstraint(-50, 120)}
                    className="p-1 rounded bg-[#1A1A1B] border border-[#333] hover:border-blue-500 text-[#AAA] hover:text-white text-center cursor-pointer"
                    title={tr("Tejido blando y muscular (-50 a 120 HU)")}
                  >{" "}{tr("T. Blando")}{" "}</button>
                  <button
                    type="button"
                    onClick={() => onChangeHuConstraint(-1000, -400)}
                    className="p-1 rounded bg-[#1A1A1B] border border-[#333] hover:border-blue-500 text-[#AAA] hover:text-white text-center cursor-pointer"
                    title={tr("Pulmón y aire (-1000 a -400 HU)")}
                  >{" "}{tr("Pulmón")}{" "}</button>
                </div>
              </div>
            )}
          </div>

          {/* Edit / Undo / Redo / Clear Slice Contour Actions */}
          <div className="bg-[#111112] border border-[#262626] rounded-lg p-2.5 flex flex-col gap-2">
            <span className="text-[11px] text-[#888] font-semibold">{" "}{tr("Historial de Edición")}{" "}</span>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                id="btn-panel-undo"
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#1A1A1B] border border-[#333] hover:border-[#555] hover:bg-[#262626] text-[#D1D1D1] text-xs font-medium transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title={tr("Deshacer (Ctrl+Z)")}
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>{" "}{tr("Deshacer")}{" "}</span>
              </button>

              <button
                id="btn-panel-redo"
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#1A1A1B] border border-[#333] hover:border-[#555] hover:bg-[#262626] text-[#D1D1D1] text-xs font-medium transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title={tr("Rehacer (Ctrl+Y)")}
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span>{" "}{tr("Rehacer")}{" "}</span>
              </button>

              <button
                id="btn-panel-clear-slice"
                type="button"
                onClick={onClearCurrentSliceContour}
                disabled={!activeRoi || activeRoi.locked}
                className="flex items-center justify-center gap-1.5 py-1.5 rounded bg-red-950/40 border border-red-900/60 hover:bg-red-900/50 text-red-300 text-xs font-medium transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title={tr("Borrar contorno de la estructura activa en este corte")}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>{" "}{tr("Borrar")}{" "}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= VISOR SUB-TAB ======================= */}
      {subTab === 'view' && (
        <div className="flex flex-col gap-3.5">
          {/* Clinical Windowing Presets */}
          <div className="bg-[#111112] border border-[#262626] rounded-lg p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#888] font-semibold">{" "}{tr("Ventanas Clínicas RT")}{" "}</span>
              <span className="text-[11px] font-mono text-blue-400">{" "}{tr("W:")}{" "}{windowWidth}{" "}{tr("L:")}{" "}{windowCenter}
              </span>
            </div>

            <select
              id="select-panel-window-preset"
              value={currentWindowPreset}
              onChange={(e) => {
                const preset = WINDOW_PRESETS.find(p => p.name === e.target.value);
                if (preset) onApplyWindowPreset(preset);
              }}
              className="w-full bg-[#1A1A1B] text-[#D1D1D1] text-xs font-mono px-2 py-1.5 rounded border border-[#333] focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {WINDOW_PRESETS.map(p => (
                <option key={p.name} value={p.name}>
                  {tr(p.name)}{" "}{tr("(W:")}{" "}{p.width}{" "}{tr("L:")}{" "}{p.center})
                </option>
              ))}
            </select>

          </div>

          {/* Fine Manual Window / Level Sliders */}
          {onWindowChange && (
            <div className="bg-[#111112] border border-[#262626] rounded-lg p-2.5 flex flex-col gap-2.5">
              <span className="text-[11px] text-[#888] font-semibold">{" "}{tr("Ajuste Fino de Brillo / Contraste")}{" "}</span>

              {/* Center / Level */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#888]">{" "}{tr("Nivel (Center / L):")}{" "}</span>
                  <span className="font-mono text-blue-400 font-bold">{windowCenter}{" "}{tr("HU")}{" "}</span>
                </div>
                <input
                  type="range"
                  min="-1000"
                  max="1500"
                  step="5"
                  value={windowCenter}
                  onChange={(e) => onWindowChange(parseInt(e.target.value), windowWidth)}
                  className="w-full accent-blue-500 cursor-pointer h-1.5 bg-[#262626] rounded appearance-none"
                />
              </div>

              {/* Width */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#888]">{" "}{tr("Ancho (Width / W):")}{" "}</span>
                  <span className="font-mono text-blue-400 font-bold">{windowWidth}{" "}{tr("HU")}{" "}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="3000"
                  step="10"
                  value={windowWidth}
                  onChange={(e) => onWindowChange(windowCenter, parseInt(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer h-1.5 bg-[#262626] rounded appearance-none"
                />
              </div>
            </div>
          )}

          {/* Reset Viewport */}
          {onResetView && (
            <button
              id="btn-panel-reset-view"
              type="button"
              onClick={onResetView}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#1A1A1B] border border-[#333] hover:border-[#555] hover:bg-[#262626] text-[#E2E2E2] text-xs font-medium transition cursor-pointer shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
              <span>{" "}{tr("Centrar Imagen y Zoom 100%")}{" "}</span>
            </button>
          )}

          {/* Interactive Mouse & Gesture Quick Reference */}
          <div className="bg-[#0A0A0B] border border-[#262626] rounded-lg p-2.5 text-[11px] text-[#888] space-y-1">
            <div className="text-[11px] text-[#888] font-semibold mb-1">{" "}{tr("Atajos de Ratón y Gestos")}{" "}</div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span>{" "}{tr("Rueda del ratón:")}{" "}</span>
              <span className="text-[#CCC]">{" "}{tr("Recorrer cortes (Z)")}{" "}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span>{" "}{tr("Clic derecho + arrastrar:")}{" "}</span>
              <span className="text-[#CCC]">{" "}{tr("Ajustar Ventana W/L")}{" "}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span>{" "}{tr("Doble clic en imagen:")}{" "}</span>
              <span className="text-[#CCC]">{" "}{tr("Centrar corte")}{" "}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

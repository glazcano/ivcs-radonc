import {tr} from '../i18n';
import React from 'react';
import { 
  Paintbrush, 
  PenTool, 
  Hexagon, 
  Eraser, 
  Sliders, 
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
  PaintBucket
} from 'lucide-react';
import { StructureRoi, ToolType, WindowPreset, ContourDrawMode } from '../types';
import { WINDOW_PRESETS } from '../utils/presets';

interface ToolbarProps {
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
}

export const Toolbar: React.FC<ToolbarProps> = ({
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
  onFillEnclosedHoles
}) => {
  const brushRadiusPx = Math.round(brushRadiusMm / pixelSpacingMm);

  const contourTools: Array<{ id: ToolType; label: string; icon: React.ReactNode; shortcut: string; hint?: string }> = [
    { id: 'brush', label: tr("Pincel"), icon: <Paintbrush className="w-4 h-4" />, shortcut: 'B', hint: tr("B (alternar con E)") },
    { id: 'pencil', label: tr("Lápiz"), icon: <PenTool className="w-4 h-4" />, shortcut: 'P' },
    { id: 'polygon', label: tr("Polígono"), icon: <Hexagon className="w-4 h-4" />, shortcut: 'G' },
    { id: 'eraser', label: tr("Borrador"), icon: <Eraser className="w-4 h-4" />, shortcut: 'E', hint: tr("E (alternar con Pincel)") },
    { id: 'threshold', label: tr("Umbral HU"), icon: <Filter className="w-4 h-4" />, shortcut: 'T' },
  ];

  const viewTools: Array<{ id: ToolType; label: string; icon: React.ReactNode; shortcut: string }> = [
    { id: 'window', label: tr("Ventana W/L"), icon: <SunMedium className="w-4 h-4" />, shortcut: 'W' },
    { id: 'pan', label: tr("Desplazar"), icon: <Move className="w-4 h-4" />, shortcut: 'H' },
    { id: 'zoom', label: tr("Zoom"), icon: <ZoomIn className="w-4 h-4" />, shortcut: 'Z' },
    { id: 'ruler', label: tr("Regla mm"), icon: <Ruler className="w-4 h-4" />, shortcut: 'R' },
  ];

  const brushSizesMm = [2, 4, 7, 12, 18, 25];

  return (
    <div className="bg-[#111112] border-b border-[#262626] px-4 py-2 flex flex-wrap items-center justify-between gap-3 select-none text-[#D1D1D1]">
      {/* Left: Tools Group */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Contouring Tools */}
        <div className="flex items-center bg-[#0A0A0B] p-1 rounded border border-[#262626] gap-0.5">
          <span className="text-[11px] text-[#888] px-2 select-none">{" "}{tr("Contorno")}{" "}</span>
          {contourTools.map(tool => {
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                id={`tool-${tool.id}`}
                onClick={() => onSelectTool(tool.id)}
                title={tr("{0} (Tecla: {1})", [tool.label,tool.hint || tool.shortcut])}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? 'bg-[#262626] text-blue-400 border border-blue-500 shadow-sm'
                    : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#1A1A1B] border border-transparent'
                }`}
              >
                {tool.icon}
                <span>{tool.label}</span>
                <span className={`text-[11px] px-1 rounded font-mono ${isActive ? 'bg-blue-600/30 text-blue-300' : 'bg-[#111112] text-[#888]'}`}>
                  {tool.shortcut}
                </span>
              </button>
            );
          })}
        </div>

        {/* Contouring Mode: Abierto vs Cerrado */}
        <div className="flex items-center bg-[#0A0A0B] p-1 rounded border border-[#262626] gap-0.5">
          <span className="text-[11px] text-[#888] px-2 select-none">{" "}{tr("Modo")}{" "}</span>
          <button
            id="btn-mode-closed"
            type="button"
            onClick={() => onChangeContourDrawMode('closed')}
            title={tr("Contorno Cerrado: Auto-rellena el interior como parte de la estructura al dibujar o cerrar el trazo (Tecla rápida: O)")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
              contourDrawMode === 'closed'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/80 shadow-sm'
                : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#1A1A1B] border border-transparent'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5 text-emerald-400" />
            <span>{" "}{tr("Cerrado")}{" "}</span>
            <span className="text-[11px] px-1 rounded font-mono bg-[#111112] text-emerald-400/80 hidden xl:inline">{" "}{tr("Relleno")}{" "}</span>
          </button>
          <button
            id="btn-mode-open"
            type="button"
            onClick={() => onChangeContourDrawMode('open')}
            title={tr("Contorno Abierto: Solo dibuja lo hecho a mano alzada con la pincel o lápiz sin rellenar el interior (Tecla rápida: O)")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
              contourDrawMode === 'open'
                ? 'bg-amber-950/80 text-amber-300 border border-amber-500/80 shadow-sm'
                : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#1A1A1B] border border-transparent'
            }`}
          >
            <PenLine className="w-3.5 h-3.5 text-amber-400" />
            <span>{" "}{tr("Abierto")}{" "}</span>
            <span className="text-[11px] px-1 rounded font-mono bg-[#111112] text-amber-400/80 hidden xl:inline">{" "}{tr("Trazo")}{" "}</span>
          </button>

          {/* Quick Action: Fill Enclosed Holes */}
          {onFillEnclosedHoles && (
            <button
              id="btn-fill-interior"
              type="button"
              onClick={onFillEnclosedHoles}
              disabled={!activeRoi || activeRoi.locked}
              title={tr("Rellenar Interior / Huecos: Rellena cualquier figura o lazo cerrado en este corte como parte de la estructura")}
              className="flex items-center gap-1 px-2 py-1.5 ml-0.5 text-xs text-[#AAA] hover:text-white hover:bg-[#1A1A1B] disabled:opacity-30 disabled:cursor-not-allowed rounded border border-transparent hover:border-[#333] transition cursor-pointer"
            >
              <PaintBucket className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden xl:inline text-[11px]">{" "}{tr("Rellenar interior")}{" "}</span>
            </button>
          )}
        </div>

        {/* View / Navigation Tools */}
        <div className="flex items-center bg-[#0A0A0B] p-1 rounded border border-[#262626] gap-0.5">
          <span className="text-[11px] text-[#888] px-2 select-none">{" "}{tr("Visor")}{" "}</span>
          {viewTools.map(tool => {
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                id={`tool-${tool.id}`}
                onClick={() => onSelectTool(tool.id)}
                title={tr("{0} (Tecla: {1})", [tool.label,tool.shortcut])}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? 'bg-[#262626] text-blue-400 border border-blue-500 shadow-sm'
                    : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#1A1A1B] border border-transparent'
                }`}
              >
                {tool.icon}
                <span className="hidden sm:inline">{tool.label}</span>
              </button>
            );
          })}
        </div>

        {/* Brush radius controls (visible when brush or eraser is active) */}
        {(activeTool === 'brush' || activeTool === 'eraser') && (
          <div 
            title={tr("Ajusta el radio de contorneo (Atajo ergonómico: Mantén Shift + Rueda del ratón en el visor)")}
            className="flex items-center gap-2 bg-[#0A0A0B] px-3 py-1.5 rounded border border-[#262626] text-xs"
          >
            <span className="text-[11px] text-[#888]">{" "}{tr("Radio:")}{" "}</span>
            <input
              type="range"
              min="1"
              max="35"
              step="1"
              value={brushRadiusMm}
              onChange={(e) => onBrushRadiusChange(parseFloat(e.target.value))}
              className="w-20 accent-blue-500 cursor-pointer h-1 bg-[#262626] rounded appearance-none"
            />
            <span className="font-mono text-blue-400 font-semibold w-14 text-right">
              {brushRadiusMm}{" "}{tr("mm")}{" "}<span className="text-[#888] text-[11px]">({brushRadiusPx}{" "}{tr("px)")}{" "}</span>
            </span>

            {/* Quick preset pills */}
            <div className="flex items-center gap-1 ml-1 border-l border-[#262626] pl-2">
              {brushSizesMm.map(size => (
                <button
                  key={size}
                  onClick={() => onBrushRadiusChange(size)}
                  className={`px-1.5 py-0.5 text-[11px] rounded cursor-pointer transition font-mono ${
                    brushRadiusMm === size 
                      ? 'bg-blue-600 text-white font-bold' 
                      : 'bg-[#1A1A1B] text-[#888] hover:text-white border border-[#333]'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* HU threshold constraint filter toggle */}
        <div className="flex items-center gap-2 bg-[#0A0A0B] px-2.5 py-1.5 rounded border border-[#262626] text-xs">
          <label className="flex items-center gap-1.5 text-[#D1D1D1] cursor-pointer">
            <input
              type="checkbox"
              checked={huConstraintEnabled}
              onChange={onToggleHuConstraint}
              className="accent-blue-500 rounded cursor-pointer"
            />
            <span className="text-[11px] text-[#888]">{" "}{tr("Filtro HU:")}{" "}</span>
          </label>
          {huConstraintEnabled && (
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <input
                type="number"
                value={huConstraintMin}
                onChange={e => onChangeHuConstraint(Number(e.target.value), huConstraintMax)}
                className="w-14 bg-[#1A1A1B] text-blue-400 px-1.5 py-0.5 rounded border border-[#333] focus:border-blue-500 text-center"
                title={tr("HU Mínimo")}
              />
              <span className="text-[#888]">{" "}{tr("a")}{" "}</span>
              <input
                type="number"
                value={huConstraintMax}
                onChange={e => onChangeHuConstraint(huConstraintMin, Number(e.target.value))}
                className="w-14 bg-[#1A1A1B] text-blue-400 px-1.5 py-0.5 rounded border border-[#333] focus:border-blue-500 text-center"
                title={tr("HU Máximo")}
              />
            </div>
          )}
        </div>
      </div>

      {/* Right: Active ROI & Windowing presets */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Active Structure Selector */}
        {activeRoi && (
          <div className="flex items-center gap-2 bg-[#0A0A0B] px-2.5 py-1.5 rounded border border-[#262626] text-xs">
            <span className="text-[11px] text-[#888]">{" "}{tr("ROI:")}{" "}</span>
            <div 
              className="w-3 h-3 rounded-sm border border-white/20 shrink-0" 
              style={{ backgroundColor: activeRoi.color }} 
            />
            <select
              id="select-active-roi"
              value={activeRoi.id}
              onChange={(e) => {
                const found = rois.find(r => r.id === e.target.value);
                if (found) onSelectRoi(found);
              }}
              className="bg-[#1A1A1B] text-[#E2E2E2] text-xs font-mono px-2 py-0.5 rounded border border-[#333] focus:outline-none focus:border-blue-500 cursor-pointer max-w-[160px] truncate"
            >
              {rois.map(roi => (
                <option key={roi.id} value={roi.id}>
                  {roi.name} [{roi.type}]
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Window Presets Dropdown */}
        <div className="flex items-center gap-1.5 bg-[#0A0A0B] px-2.5 py-1.5 rounded border border-[#262626] text-xs">
          <span className="text-[11px] text-[#888]">{" "}{tr("W/L:")}{" "}</span>
          <select
            id="select-window-preset"
            value={currentWindowPreset}
            onChange={(e) => {
              const preset = WINDOW_PRESETS.find(p => p.name === e.target.value);
              if (preset) onApplyWindowPreset(preset);
            }}
            className="bg-[#1A1A1B] text-[#D1D1D1] text-xs font-mono px-2 py-0.5 rounded border border-[#333] focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            {WINDOW_PRESETS.map(p => (
              <option key={p.name} value={p.name}>
                {p.name}{" "}{tr("(W:")}{" "}{p.width}{" "}{tr("L:")}{" "}{p.center})
              </option>
            ))}
          </select>
        </div>

        {/* Undo / Redo / Clear Slice */}
        <div className="flex items-center gap-0.5 bg-[#0A0A0B] p-1 rounded border border-[#262626]">
          <button
            id="btn-undo"
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded text-xs transition cursor-pointer ${
              canUndo ? 'text-[#D1D1D1] hover:bg-[#262626]' : 'text-[#444] cursor-not-allowed'
            }`}
            title={tr("Deshacer (Ctrl+Z)")}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            id="btn-redo"
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded text-xs transition cursor-pointer ${
              canRedo ? 'text-[#D1D1D1] hover:bg-[#262626]' : 'text-[#444] cursor-not-allowed'
            }`}
            title={tr("Rehacer (Ctrl+Y)")}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <div className="h-4 w-[1px] bg-[#262626] mx-0.5" />
          <button
            id="btn-clear-slice"
            onClick={onClearCurrentSliceContour}
            disabled={!activeRoi || activeRoi.locked}
            className="p-1.5 rounded text-xs text-red-400 hover:bg-red-500/10 transition cursor-pointer disabled:text-[#444] disabled:cursor-not-allowed"
            title={tr("Borrar contorno de la estructura activa en este corte")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

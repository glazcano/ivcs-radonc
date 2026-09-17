import {tr} from '../i18n';
import React from 'react';
import { 
  Crosshair, 
  Target, 
  RotateCcw, 
  Maximize2, 
  Layers, 
  Info,
  Sliders,
  Compass
} from 'lucide-react';
import { 
  DicomSeries, 
  StructureRoi, 
  MprCoordinates, 
  MprViewMode 
} from '../types';
import { 
  getVolumeGeometry, 
  calculateRoiCentroid, 
  voxelToPatientCoordinates 
} from '../utils/mprEngine';

interface MprControlPanelProps {
  series: DicomSeries | null;
  coordinates: MprCoordinates;
  onNavigateCoordinates: (coords: Partial<MprCoordinates>) => void;
  activeRoi: StructureRoi | null;
  showCrosshairs: boolean;
  onToggleCrosshairs: () => void;
  onSelectViewMode: (mode: MprViewMode) => void;
  windowCenter: number;
  windowWidth: number;
}

export const MprControlPanel: React.FC<MprControlPanelProps> = ({
  series,
  coordinates,
  onNavigateCoordinates,
  activeRoi,
  showCrosshairs,
  onToggleCrosshairs,
  onSelectViewMode,
  windowCenter,
  windowWidth
}) => {
  const geo = getVolumeGeometry(series);
  const { cols, rows, numSlices, pixelSpacingX, pixelSpacingY, sliceSpacingZ } = geo;

  const physicalCoords = voxelToPatientCoordinates(coordinates, series);

  const handleCenterOnActiveRoi = () => {
    if (!activeRoi) return;
    const centroid = calculateRoiCentroid(activeRoi, cols, rows, numSlices);
    if (centroid) {
      onNavigateCoordinates(centroid);
    }
  };

  const handleResetCenter = () => {
    onNavigateCoordinates({
      x: Math.floor(cols / 2),
      y: Math.floor(rows / 2),
      z: Math.floor(numSlices / 2)
    });
  };

  return (
    <div className="flex-1 bg-[#0A0A0B] border border-[#262626] rounded-none p-3.5 flex flex-col justify-between overflow-y-auto text-xs text-[#D1D1D1] select-none">
      {/* Header */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between border-b border-[#222] pb-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-[#E2E2E2] tracking-wide text-xs">{" "}{tr("Navegación Multiplanar (MPR 3D)")}{" "}</h3>
          </div>

          <button
            onClick={onToggleCrosshairs}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition cursor-pointer ${
              showCrosshairs 
                ? 'bg-blue-950/60 border-blue-500/50 text-blue-300' 
                : 'bg-[#1A1A1B] border-[#333] text-[#777] hover:text-[#CCC]'
            }`}
            title={tr("Activar/desactivar guías cruzadas de referencia")}
          >
            <Crosshair className="w-3 h-3" />
            <span>{" "}{tr("Guías")}{" "}{showCrosshairs ? tr("ON") : tr("OFF")}</span>
          </button>
        </div>

        {/* 3D Crosshair Coordinate Sliders */}
        <div className="space-y-2 bg-[#111112] border border-[#1E1E1F] rounded p-2.5">
          <div className="text-[11px] font-mono text-[#888] flex items-center justify-between">
            <span>{" "}{tr("Coordenadas de Corte 3D")}{" "}</span>
            <span className="text-[#777]">{" "}{tr("[X, Y, Z]")}{" "}</span>
          </div>

          {/* X - Sagittal */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{" "}{tr("SAGITAL (X):")}{" "}</span>
              <span className="text-[#AAA]">
                {coordinates.x + 1} / {cols}{' '}
                <span className="text-[#888]">({physicalCoords.xMm}{" "}{tr("mm)")}{" "}</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={cols - 1}
              value={coordinates.x}
              onChange={(e) => onNavigateCoordinates({ x: parseInt(e.target.value) })}
              className="w-full h-1 bg-[#262626] rounded appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          {/* Y - Coronal */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{" "}{tr("CORONAL (Y):")}{" "}</span>
              <span className="text-[#AAA]">
                {coordinates.y + 1} / {rows}{' '}
                <span className="text-[#888]">({physicalCoords.yMm}{" "}{tr("mm)")}{" "}</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={rows - 1}
              value={coordinates.y}
              onChange={(e) => onNavigateCoordinates({ y: parseInt(e.target.value) })}
              className="w-full h-1 bg-[#262626] rounded appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Z - Axial */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-sky-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />{" "}{tr("AXIAL (Z):")}{" "}</span>
              <span className="text-[#AAA]">
                {coordinates.z + 1} / {numSlices}{' '}
                <span className="text-[#888]">({physicalCoords.zMm}{" "}{tr("mm)")}{" "}</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={numSlices - 1}
              value={coordinates.z}
              onChange={(e) => onNavigateCoordinates({ z: parseInt(e.target.value) })}
              className="w-full h-1 bg-[#262626] rounded appearance-none cursor-pointer accent-sky-500"
            />
          </div>
        </div>

        {/* Quick Alignment Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleCenterOnActiveRoi}
            disabled={!activeRoi}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-[#1A1A1B] border border-[#333] hover:border-[#555] hover:bg-[#262626] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-[#E2E2E2] transition cursor-pointer"
            title={activeRoi ? tr("Centrar vista 3D en el centroide de {0}", [activeRoi.name]) : tr("Selecciona una estructura")}
          >
            <Target className="w-3.5 h-3.5 text-blue-400" />
            <span className="truncate">{" "}{tr("Centrar en ROI")}{" "}</span>
          </button>

          <button
            onClick={handleResetCenter}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-[#1A1A1B] border border-[#333] hover:border-[#555] hover:bg-[#262626] text-xs font-medium text-[#E2E2E2] transition cursor-pointer"
            title={tr("Centrar cortes en el centro geométrico del volumen")}
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#888]" />
            <span>{" "}{tr("Centro Volumen")}{" "}</span>
          </button>
        </div>

        {/* Quick Viewport Maximizers */}
        <div className="space-y-1">
          <div className="text-[11px] font-mono text-[#888]">{" "}{tr("Maximizar Plano Individual")}{" "}</div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => onSelectViewMode('axial')}
              className="flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-sky-950/40 border border-sky-600/40 hover:bg-sky-900/50 text-sky-300 text-[11px] font-medium transition cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              <span>{" "}{tr("Axial")}{" "}</span>
            </button>
            <button
              onClick={() => onSelectViewMode('coronal')}
              className="flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-emerald-950/40 border border-emerald-600/40 hover:bg-emerald-900/50 text-emerald-300 text-[11px] font-medium transition cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              <span>{" "}{tr("Coronal")}{" "}</span>
            </button>
            <button
              onClick={() => onSelectViewMode('sagittal')}
              className="flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-amber-950/40 border border-amber-600/40 hover:bg-amber-900/50 text-amber-300 text-[11px] font-medium transition cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              <span>{" "}{tr("Sagital")}{" "}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Volume Metadata Card */}
      <div className="bg-[#111112] border border-[#1E1E1F] rounded p-2 text-[11px] font-mono text-[#777] space-y-1 mt-2">
        <div className="flex justify-between">
          <span>{" "}{tr("MATRIZ 3D:")}{" "}</span>
          <span className="text-[#AAA]">{cols}{" "}{tr("×")}{" "}{rows}{" "}{tr("×")}{" "}{numSlices}{" "}{tr("px")}{" "}</span>
        </div>
        <div className="flex justify-between">
          <span>{" "}{tr("ESPACIADO VOXEL:")}{" "}</span>
          <span className="text-[#AAA]">{pixelSpacingX.toFixed(2)}{" "}{tr("×")}{" "}{pixelSpacingY.toFixed(2)}{" "}{tr("×")}{" "}{sliceSpacingZ.toFixed(2)}{" "}{tr("mm")}{" "}</span>
        </div>
        <div className="flex justify-between">
          <span>{" "}{tr("VENTANEO (W/L):")}{" "}</span>
          <span className="text-[#AAA]">{" "}{tr("C:")}{" "}{windowCenter}{" "}{tr("/ W:")}{" "}{windowWidth}{" "}{tr("HU")}{" "}</span>
        </div>
        {activeRoi && (
          <div className="flex justify-between pt-1 border-t border-[#222]">
            <span className="text-[#999]">{" "}{tr("ESTRUCTURA ACTIVA:")}{" "}</span>
            <span className="font-bold truncate max-w-[130px]" style={{ color: activeRoi.color }}>
              {activeRoi.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
